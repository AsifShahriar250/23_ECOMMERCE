import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import { generatePaymentIntent } from "../utils/generatePaymentIntent.js";

export const placeNewOrder = catchAsyncErrors(async (req, res, next) => {
  const {
    full_name,
    state,
    city,
    address,
    country,
    phone,
    orderedItems,
    pincode,
  } = req.body;
  if (
    !full_name ||
    !state ||
    !city ||
    !address ||
    !country ||
    !phone ||
    !pincode
  ) {
    return next(new ErrorHandler("Please fill all the shipping details", 400));
  }

  let items = orderedItems;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      return next(new ErrorHandler("orderedItems must be valid JSON.", 400));
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return next(new ErrorHandler("No items in the order", 400));
  }

  const productIds = items.map((item) => item.productId || item.product?.id);
  if (productIds.some((productId) => typeof productId !== "string")) {
    return next(new ErrorHandler("Every order item needs a product ID.", 400));
  }
  const { rows: products } = await database.query(
    `
    SELECT id, name, price, stock FROM products WHERE id = ANY($1::uuid[])`,
    [productIds],
  );

  let total_price = 0;
  const values = [];
  const placeholders = [];

  for (const [index, item] of items.entries()) {
    const productId = item.productId || item.product?.id;
    const product = products.find((p) => p.id === productId);
    const quantity = Number(item.quantity);

    if (!product) {
      return next(new ErrorHandler(`Product with ID ${productId} was not found.`, 404));
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      return next(new ErrorHandler("Quantity must be a positive integer.", 400));
    }

    if (quantity > product.stock) {
      return next(
        new ErrorHandler(
          `only ${product.stock} units available for ${product.name}`,
          400,
        ),
      );
    }

    const itemTotal = Number(product.price) * quantity;
    total_price += itemTotal;

    values.push(
      null,
      product.id,
      quantity,
      product.price,
      product.images?.[0]?.url || "",
      product.name,
    );

    const offset = index * 6;
    placeholders.push(
      `( $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`,
    );
  }

  const tax_price = Math.round(total_price * 0.008 * 100) / 100;
  const shipping_price = 2;
  total_price = Math.round((total_price + tax_price + shipping_price) * 100) / 100;

  const orderResult = await database.query(`
    INSERT INTO orders(buyer_id, total_price, tax_price, shipping_price) VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.id, total_price, tax_price, shipping_price]
  );

  const orderId = orderResult.rows[0].id;

  for (let i = 0; i < values.length; i += 6) {
    values[i] = orderId;
  }

  await database.query(`
    INSERT INTO order_items(order_id, product_id, quantity, price, image, title) VALUES ${placeholders.join(", ")}
    RETURNING *`,
    values
  );

  await database.query(`
    INSERT INTO shipping_info (order_id, full_name, state, city, address, country, phone, pincode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orderId, full_name, state, city, address, country, phone, pincode]
  );

  const paymentResponse = await generatePaymentIntent(orderId, total_price);

  if(!paymentResponse.success){
    return next(new ErrorHandler("Payment failed. Try again later.", 500));
  }

  res.status(201).json({
    success: true,
    message: "Order placed successfully. Please proceed to payment.",
    paymentIntent: paymentResponse.clientSecret,
    total_price,
  });
});

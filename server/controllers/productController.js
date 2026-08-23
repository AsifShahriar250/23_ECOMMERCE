import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import ErrorHandler from "../middlewares/errorMiddleware.js";
import database from "../database/db.js";
import { v2 as cloudinary } from "cloudinary";

export const createProduct = catchAsyncErrors(async (req, res, next) => {
  const { name, description, price, category, stock } = req.body;
  const created_by = req.user.id;

  if (!name || !description || !price || !category || !stock) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400),
    );
  }

  let uploadedImages = [];
  if (req.files && req.files.images) {
    const images = Array.isArray(req.files.images)
      ? req.files.images
      : [req.files.images];

    for (const image of images) {
      const result = await cloudinary.uploader.upload(image.tempFilePath, {
        folder: "Ecommerce_Product_Images",
        width: 1000,
        crop: "scale",
      });

      uploadedImages.push({
        url: result.secure_url,
        public_id: result.public_id,
      });
    }
  }

  const product = await database.query(
    `INSERT INTO products (name, description, price, category, stock, images, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      name,
      description,
      price,
      category,
      stock,
      JSON.stringify(uploadedImages),
      created_by,
    ],
  );

  res.status(201).json({
    success: true,
    message: "Product created successfully.",
    product: product.rows[0],
  });
});

export const fetchAllProducts = catchAsyncErrors(async (req, res, next) => {
  const { availability, price, category, ratings, search } = req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const conditions = [];
  let values = [];
  let index = 1;

  let paginationPlaceholders = {};

  //Availability filter Product
  if (availability === "in-stock") {
    conditions.push(`stock > 5`);
  } else if (availability === "limited") {
    conditions.push(`stock > 0 AND stock <= 5`);
  } else if (availability === "out-of-stock") {
    conditions.push(`stock = 0`);
  }

  //availability by price
  if (price) {
    const [minPrice, maxPrice] = price.split("-");
    if (minPrice && maxPrice) {
      conditions.push(`price BETWEEN $${index} AND $${index + 1}`);
      values.push(minPrice, maxPrice);
      index += 2;
    }
  }

  //buy catagory
  if (category) {
    conditions.push(`category ILIKE $${index}`);
    values.push(`%${category}%`);
    index++;
  }

  //filter by rating
  if (ratings) {
    conditions.push(`ratings >= $${index}`);
    values.push(ratings);
    index++;
  }

  //add search query
  if (search) {
    conditions.push(
      `(p.name ILIKE $${index} OR p.description ILIKE $${index})`,
    );
    values.push(`%${search}%`);
    index++;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  //get count of filtered product
  const totalProductResult = await database.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values,
  );

  const totalProducts = parseInt(totalProductResult.rows[0].count);

  paginationPlaceholders.limit = `$${index}`;
  values.push(limit);
  index++;

  paginationPlaceholders.offset = `$${index}`;
  values.push(offset);
  index++;

  //FETCH With reviews
  const query = `
    SELECT p.*,
    COUNT(r.id) AS review_count
    FROM products p
    LEFT JOIN reviews r ON p.id = r.product_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ${paginationPlaceholders.limit}
    OFFSET ${paginationPlaceholders.offset}
  `;

  const result = await database.query(query, values);

  //Query for faching new products
  const newProductsQuery = `
  SELECT p.*,
  COUNT(r.id) AS review_count
  FROM products p
  LEFT JOIN reviews r ON p.id = r.product_id
  WHERE p.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY p.id
  ORDER BY p.created_at DESC
  LIMIT 8
  `;
  const newProductsResult = await database.query(newProductsQuery);

  //Query for faching Top rating products
  const topRatedQuery = `
  SELECT p.*,
  COUNT(r.id) AS review_count
  FROM products p
  LEFT JOIN reviews r ON p.id = r.product_id
  WHERE p.ratings >= 4.5
  GROUP BY p.id
  ORDER BY p.ratings DESC, p.created_at DESC
  LIMIT 8
  `;
  const topRatedResult = await database.query(topRatedQuery);

  res.status(200).json({
    success: true,
    products: result.rows,
    totalProducts,
    newProducts: newProductsResult.rows,
    topRatedProducts: topRatedResult.rows,
  });
});

export const updateProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;
  const { name, description, price, category, stock } = req.body;

  if (!name || !description || !price || !category || !stock) {
    return next(
      new ErrorHandler("Please provide complete product details.", 400),
    );
  }
  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }
  const result = await database.query(
    `UPDATE products SET name = $1, description = $2, price = $3, category = $4, stock = $5 WHERE id = $6 RETURNING *`,
    [name, description, price, category, stock, productId],
  );

  res.status(200).json({
    success: true,
    message: "Product updated successfully.",
    updatedProduct: result.rows[0],
  });
});

export const deleteProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const product = await database.query("SELECT * FROM products WHERE id = $1", [
    productId,
  ]);
  if (product.rows.length === 0) {
    return next(new ErrorHandler("Product not found.", 404));
  }

  const images = product.rows[0].images;

  const deleteResult = await database.query(
    "DELETE FROM products WHERE id = $1 RETURNING *",
    [productId],
  );

  if (deleteResult.rows.length === 0) {
    return next(new ErrorHandler("Failed to delete product.", 500));
  }

  //delete image from cludensry
  if (images && images.length > 0) {
    for (const image of images) {
      await cloudinary.uploader.destroy(image.public_id);
    }
  }
  res.status(200).json({
    success: true,
    message: "Product deleted successfully.",
  });
});

export const fetchSingleProduct = catchAsyncErrors(async (req, res, next) => {
  const { productId } = req.params;

  const result = await database.query(
    `
  SELECT p.*, 
    COALESCE(
      json_agg(
        json_build_object(
          'review_id', r.id,
          'rating', r.rating,
          'comment', r.comment,
          'reviewer', json_build_object(
            'id', u.id,
            'name', u.name,
            'avatar', u.avatar
          )
        )
      ) FILTER (WHERE r.id IS NOT NULL), '[]'
    ) AS reviews
     FROM products p
     LEFT JOIN reviews r ON p.id = r.product_id
     LEFT JOIN users u On r.user_id = u.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [productId],
  );
});

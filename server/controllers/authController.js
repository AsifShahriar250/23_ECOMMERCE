import ErrorHandler from "../middlewares/errorMiddleware.js";
import { catchAsyncErrors } from "../middlewares/catchAsyncError.js";
import database from "../database/db.js";
import bcrypt from "bcryptjs";
import { sendToken } from "../utils/jwtToken.js";

export const register = catchAsyncErrors(async (req, res, next) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return next(new ErrorHandler("Please provide all required fields.", 400));
  }
  const isAlreadyregistered = await database.query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );

  if (isAlreadyregistered.rows.length > 0) {
    return next(
      new ErrorHandler("User already registered with this email.", 400),
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await database.query(
    "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
    [name, email, hashedPassword],
  );
  sendToken(user.rows[0], 201, "User resistered successfully", res);
});

export const login = catchAsyncErrors(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler("Please provide email and password.", 400));
  }
  const user = await database.query(`SELECT * FROM users WHERE email = $1`, [
    email,
  ]);
  if (user.rows.length === 0) {
    return next(new ErrorHandler("Invalid email or password.", 401));
  }
  const isPasswordMatch = await bcrypt.compare(password, user.rows[0].password);
  if (!isPasswordMatch) {
    return next(new ErrorHandler("Invalid email or password.", 401));
  }
  sendToken(user.rows[0], 200, "UnLogged In.", res);
});

export const getUser = catchAsyncErrors(async (req, res, next) => {
  const { user } = req;
  res.status(200).json({
    success: true,
    user,
  });
});

export const logout = catchAsyncErrors(async (req, res, next) => {
  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Logged out successfully.",
    });
});

export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body;
  const { frontendUrl } = req.query;
  let userResult = await database.query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );
  if (userResult.rows.length === 0) {
    return next(new ErrorHandler("User not found with this email.", 404));
  }
  const user = userResult.rows[0];

  const { hashedToken, resetPasswordExpireTime, resetToken } =
    generateResetPasswordToken();

  await database.query(
    `UPDATE users SET reset_password_token = $1, reset_password_expire  = to_timestamp($2) WHERE email = $3`,
    [hashedToken, resetPasswordExpireTime / 1000, email],
  );

  const resetPasswordUrl = `${frontendUrl}/password/reset/${resetToken}`;
  const message = generateEmailTemplate(resetPasswordUrl);

});

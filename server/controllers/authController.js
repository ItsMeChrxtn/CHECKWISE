import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { signToken } from "../utils/token.js";

/** POST /api/auth/register - self-service teacher signup. */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    throw ApiError.conflict("An account with that email already exists.");
  }

  // Role is deliberately not taken from the request body: signup always creates
  // a teacher. Admins are provisioned via `npm run seed:admin`.
  const user = await User.create({ name, email, password, role: "teacher" });

  res.status(201).json({
    success: true,
    message: "Your CheckWise account is ready.",
    data: { user: user.toJSON(), token: signToken(user) },
  });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");

  // Same message for unknown email and wrong password - no account enumeration.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized("Incorrect email or password.");
  }

  if (!user.isActive) {
    throw ApiError.forbidden("This account has been deactivated. Contact your administrator.");
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: `Welcome back, ${user.name.split(" ")[0]}.`,
    data: { user: user.toJSON(), token: signToken(user) },
  });
});

/** GET /api/auth/me - rehydrates the session on page reload. */
export const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toJSON() } });
});

/**
 * POST /api/auth/logout
 * Tokens are stateless, so the client discards it. This endpoint exists so the
 * client has one consistent place to end a session (and a hook for a future
 * token denylist).
 */
export const logout = asyncHandler(async (_req, res) => {
  res.json({ success: true, message: "You have been signed out." });
});

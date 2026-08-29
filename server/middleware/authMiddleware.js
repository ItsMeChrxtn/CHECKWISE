import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { verifyToken } from "../utils/token.js";

/**
 * Verifies the Bearer token and attaches the live user document to req.user.
 * The user is re-read on every request so deactivated accounts lose access
 * immediately rather than when their token expires.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Authentication required. Please sign in.");
  }

  const token = header.slice(7).trim();

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    const message =
      error.name === "TokenExpiredError"
        ? "Your session has expired. Please sign in again."
        : "Invalid authentication token.";
    throw ApiError.unauthorized(message);
  }

  const user = await User.findById(payload.sub);

  if (!user) throw ApiError.unauthorized("The account for this session no longer exists.");
  if (!user.isActive) throw ApiError.forbidden("This account has been deactivated.");

  req.user = user;
  next();
});

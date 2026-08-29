import multer from "multer";
import ApiError from "../utils/ApiError.js";
import { isProduction } from "../config/env.js";

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Single place that turns any thrown value into the consistent API shape:
 *   { success: false, message: string, errors?: object }
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong on our end.";
  let details = err.details || null;

  // Mongoose schema validation -> field-level messages
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Please check the highlighted fields.";
    details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message])
    );
  }

  // Duplicate key (e.g. email already registered)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "value";
    message = `That ${field} is already registered.`;
    details = { [field]: `This ${field} is already in use.` };
  }

  // Malformed ObjectId in a route param
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path} provided.`;
  }

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large."
        : `Upload failed: ${err.message}`;
  }

  if (statusCode >= 500) {
    console.error("[CheckWise] Unhandled error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {}),
    ...(isProduction ? {} : { stack: err.stack }),
  });
}

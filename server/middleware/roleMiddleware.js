import ApiError from "../utils/ApiError.js";

/**
 * Restricts a route to the given roles. Must run after `protect`.
 * Usage: router.get("/users", protect, authorize("admin"), handler)
 */
export function authorize(...roles) {
  return function checkRole(req, _res, next) {
    if (!req.user) return next(ApiError.unauthorized());

    if (!roles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(`This action requires one of the following roles: ${roles.join(", ")}.`)
      );
    }

    next();
  };
}

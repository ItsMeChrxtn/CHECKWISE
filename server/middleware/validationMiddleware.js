import ApiError from "../utils/ApiError.js";

/**
 * Tiny declarative request-body validator.
 *
 *   validate({ email: { required: true, email: true },
 *              password: { required: true, minLength: 8 } })
 *
 * Collects every failing field so the client can highlight them all at once,
 * and trims/normalises values in place before the controller sees them.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validate(rules) {
  return function runValidation(req, _res, next) {
    const errors = {};
    const body = req.body || {};

    for (const [field, rule] of Object.entries(rules)) {
      let value = body[field];

      if (typeof value === "string") {
        value = value.trim();
        body[field] = value;
      }

      const isEmpty = value === undefined || value === null || value === "";

      if (rule.required && isEmpty) {
        errors[field] = rule.message || `${label(field)} is required.`;
        continue;
      }

      if (isEmpty) continue;

      if (rule.email && !EMAIL_RE.test(value)) {
        errors[field] = "Please enter a valid email address.";
        continue;
      }

      if (rule.minLength && String(value).length < rule.minLength) {
        errors[field] = `${label(field)} must be at least ${rule.minLength} characters.`;
        continue;
      }

      if (rule.maxLength && String(value).length > rule.maxLength) {
        errors[field] = `${label(field)} must be at most ${rule.maxLength} characters.`;
        continue;
      }

      if (rule.integer) {
        const num = Number(value);
        if (!Number.isInteger(num)) {
          errors[field] = `${label(field)} must be a whole number.`;
          continue;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors[field] = `${label(field)} must be at least ${rule.min}.`;
          continue;
        }
        if (rule.max !== undefined && num > rule.max) {
          errors[field] = `${label(field)} must be at most ${rule.max}.`;
          continue;
        }
        body[field] = num;
      }

      if (rule.oneOf && !rule.oneOf.includes(value)) {
        errors[field] = `${label(field)} must be one of: ${rule.oneOf.join(", ")}.`;
      }
    }

    if (Object.keys(errors).length) {
      return next(ApiError.badRequest("Please check the highlighted fields.", errors));
    }

    next();
  };
}

function label(field) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

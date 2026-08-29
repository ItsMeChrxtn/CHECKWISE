import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getMe, login, logout, register } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validationMiddleware.js";

const router = Router();

// Slows down credential-stuffing without inconveniencing a real user.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please wait a few minutes and try again.",
  },
});

router.post(
  "/register",
  authLimiter,
  validate({
    name: { required: true, minLength: 2, maxLength: 80 },
    email: { required: true, email: true },
    password: { required: true, minLength: 8, maxLength: 128 },
  }),
  register
);

router.post(
  "/login",
  authLimiter,
  validate({
    email: { required: true, email: true },
    password: { required: true },
  }),
  login
);

router.get("/me", protect, getMe);
router.post("/logout", protect, logout);

export default router;

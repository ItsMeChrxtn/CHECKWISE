import { Router } from "express";
import authRoutes from "./authRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import examRoutes from "./examRoutes.js";
import resultRoutes from "./resultRoutes.js";
import userRoutes from "./userRoutes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, service: "checkwise-api", uptime: process.uptime() });
});

router.use("/auth", authRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/exams", examRoutes);
router.use("/results", resultRoutes);
router.use("/users", userRoutes);

export default router;

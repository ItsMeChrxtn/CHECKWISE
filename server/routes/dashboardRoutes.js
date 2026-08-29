import { Router } from "express";
import { getStats } from "../controllers/dashboardController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

router.get("/stats", protect, authorize("admin", "teacher"), getStats);

export default router;

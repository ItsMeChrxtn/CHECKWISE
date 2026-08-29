import { Router } from "express";
import {
  deleteResult,
  getResult,
  listAllResults,
  updateResult,
} from "../controllers/resultController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

router.get("/", listAllResults);
router.get("/:id", getResult);
router.patch("/:id", updateResult);
router.delete("/:id", deleteResult);

export default router;

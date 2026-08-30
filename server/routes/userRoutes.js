import { Router } from "express";
import { deleteUser, listUsers, updateUser } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorize } from "../middleware/roleMiddleware.js";

const router = Router();

// Administering accounts is an admin-only area, whole and entire.
router.use(protect, authorize("admin"));

router.get("/", listUsers);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;

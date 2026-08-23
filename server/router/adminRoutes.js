import express from "express";
import {
  getAllUsers,
  deleteUser,
  dashboardStats,
} from "../controllers/adminController.js";
import {
  authorizedRoles,
  isAuthenticated,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get(
  "/getalluser",
  isAuthenticated,
  authorizedRoles("Admin"),
  getAllUsers,
);
router.delete(
  "/delete/:id",
  isAuthenticated,
  authorizedRoles("Admin"),
  deleteUser,
);

router.get(
  "/fetch/dashboard-stats",
  isAuthenticated,
  authorizedRoles("Admin"),
  dashboardStats,
);

export default router;

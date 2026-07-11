const { Router } = require("express");
const contactController = require("./contact.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

// PUBLIC
router.post("/", contactController.submit);

// ADMIN ONLY
router.get("/", authMiddleware, adminMiddleware, contactController.list);
router.patch("/:uuid", authMiddleware, adminMiddleware, contactController.update);
router.delete("/:uuid", authMiddleware, adminMiddleware, contactController.remove);

module.exports = router;

const { Router } = require("express");
const newsletterController = require("./newsletter.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

// PUBLIC
router.post("/subscribe", newsletterController.subscribe);
router.get("/unsubscribe", newsletterController.unsubscribeConfirm);
router.post("/unsubscribe", newsletterController.unsubscribe);

// ADMIN ONLY
router.get("/subscribers", authMiddleware, adminMiddleware, newsletterController.list);
router.delete("/subscribers/:uuid", authMiddleware, adminMiddleware, newsletterController.remove);

module.exports = router;

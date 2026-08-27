const { Router } = require("express");
const viewController = require("./view.controller");
const optionalAuth = require("../../middleware/optionalAuth.middleware");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

// Writes a row per unique viewer, so it is rate limited like any other write
// even though it needs no authentication.
router.post("/:slug/views", optionalAuth, limits.write, viewController.incrementView);

module.exports = router;

const { Router } = require("express");
const viewController = require("./view.controller");
const optionalAuth = require("../../middleware/optionalAuth.middleware");

const router = Router();

router.post("/:slug/views", optionalAuth, viewController.incrementView);

module.exports = router;

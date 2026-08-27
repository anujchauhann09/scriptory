const { Router } = require("express");
const tagController = require("./tag.controller");

const router = Router();

// Public, cached in-process, and covered by the global API limit.
router.get("/", tagController.listTags);

module.exports = router;

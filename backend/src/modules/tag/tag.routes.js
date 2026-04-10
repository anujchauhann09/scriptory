const { Router } = require("express");
const tagController = require("./tag.controller");

const router = Router();

router.get("/", tagController.listTags);

module.exports = router;

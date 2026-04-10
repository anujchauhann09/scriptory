const { Router } = require("express");
const commentController = require("./comment.controller");
const authMiddleware = require("../../middleware/auth.middleware");

const router = Router({ mergeParams: true });

router.get("/", commentController.getComments);
router.post("/", authMiddleware, commentController.createComment);
router.delete("/:uuid", authMiddleware, commentController.deleteComment);

module.exports = router;

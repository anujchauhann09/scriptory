const { Router } = require("express");
const commentController = require("./comment.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const optionalAuth = require("../../middleware/optionalAuth.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const { createCommentSchema, listCommentsSchema } = require("./comment.validation");

const router = Router({ mergeParams: true });

// optionalAuth so an admin previewing a draft can still read its thread; for
// everyone else the article resolves as not-found and so does the thread.
router.get("/", optionalAuth, validate(listCommentsSchema, "query"), commentController.getComments);
router.post(
  "/",
  authMiddleware,
  limits.write,
  validate(createCommentSchema),
  commentController.createComment
);
router.delete("/:uuid", authMiddleware, limits.write, commentController.deleteComment);

module.exports = router;

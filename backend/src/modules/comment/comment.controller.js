const commentService = require("./comment.service");
const { sendSuccess, sendError } = require("../../utils/response");

const getComments = async (req, res, next) => {
  try {
    const comments = await commentService.getComments(req.params.articleId);
    return sendSuccess(res, 200, "Comments fetched", comments);
  } catch (err) {
    next(err);
  }
};

const createComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return sendError(res, 400, "Comment content is required");
    }
    const comment = await commentService.createComment(
      req.user.uuid,
      req.params.articleId,
      content.trim()
    );
    return sendSuccess(res, 201, "Comment created", comment);
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    await commentService.deleteComment(
      req.params.uuid,
      req.user.uuid,
      req.user.role === "ADMIN"
    );
    return sendSuccess(res, 200, "Comment deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { getComments, createComment, deleteComment };

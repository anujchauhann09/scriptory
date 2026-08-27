const commentService = require("./comment.service");
const { validated } = require("../../middleware/validate.middleware");
const { sendSuccess } = require("../../utils/response");

const getComments = async (req, res, next) => {
  try {
    const { comments, pagination } = await commentService.getComments(
      req.params.articleId,
      req.user,
      validated(req, "query")
    );
    // The response body stays the bare array the client already expects;
    // pagination travels in a header so no existing caller breaks.
    res.set("X-Total-Count", String(pagination.total));
    return sendSuccess(res, 200, "Comments fetched", comments);
  } catch (err) {
    next(err);
  }
};

const createComment = async (req, res, next) => {
  try {
    const comment = await commentService.createComment(
      req.user.uuid,
      req.params.articleId,
      req.body.content,
      req.user
    );
    return sendSuccess(res, 201, "Comment created", comment);
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    await commentService.deleteComment(req.params.uuid, req.user.uuid, req.user.role === "ADMIN");
    return sendSuccess(res, 200, "Comment deleted");
  } catch (err) {
    next(err);
  }
};

module.exports = { getComments, createComment, deleteComment };

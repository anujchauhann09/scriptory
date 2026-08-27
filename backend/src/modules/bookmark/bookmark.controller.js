const bookmarkService = require("./bookmark.service");
const { sendSuccess } = require("../../utils/response");

const status = async (req, res, next) => {
  try {
    const result = await bookmarkService.getStatus(req.user.uuid, req.params.slug, req.user);
    return sendSuccess(res, 200, "Bookmark status", result);
  } catch (err) {
    next(err);
  }
};

const toggle = async (req, res, next) => {
  try {
    const result = await bookmarkService.toggle(req.user.uuid, req.params.slug, req.user);
    return sendSuccess(res, 200, result.bookmarked ? "Bookmarked" : "Bookmark removed", result);
  } catch (err) {
    next(err);
  }
};

const list = async (req, res, next) => {
  try {
    const articles = await bookmarkService.list(req.user.uuid);
    return sendSuccess(res, 200, "Bookmarks fetched", articles);
  } catch (err) {
    next(err);
  }
};

module.exports = { status, toggle, list };

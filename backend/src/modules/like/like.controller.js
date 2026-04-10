const likeService = require("./like.service");
const { sendSuccess } = require("../../utils/response");

const getLikeStatus = async (req, res, next) => {
  try {
    const result = await likeService.getLikeStatus(req.user?.uuid ?? null, req.params.slug);
    return sendSuccess(res, 200, "Like status fetched", result);
  } catch (err) {
    next(err);
  }
};

const toggleLike = async (req, res, next) => {
  try {
    const result = await likeService.toggleLike(req.user.uuid, req.params.slug);
    return sendSuccess(res, 200, result.liked ? "Liked" : "Unliked", result);
  } catch (err) {
    next(err);
  }
};

module.exports = { getLikeStatus, toggleLike };

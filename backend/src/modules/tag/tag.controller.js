const tagService = require("./tag.service");
const { sendSuccess } = require("../../utils/response");

const listTags = async (req, res, next) => {
  try {
    const tags = await tagService.listTags();
    return sendSuccess(res, 200, "Tags fetched", tags);
  } catch (err) {
    next(err);
  }
};

module.exports = { listTags };

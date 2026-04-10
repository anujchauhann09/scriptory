const viewService = require("./view.service");
const { sendSuccess } = require("../../utils/response");

const incrementView = async (req, res, next) => {
  try {
    const result = await viewService.incrementView(req.params.slug, req);
    return sendSuccess(res, 200, "View counted", result);
  } catch (err) {
    next(err);
  }
};

module.exports = { incrementView };

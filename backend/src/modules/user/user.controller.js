const userService = require("./user.service");
const { sendSuccess } = require("../../utils/response");

const getMe = async (req, res, next) => {
  try {
    const user = await userService.getMe(req.user.uuid);
    return sendSuccess(res, 200, "User fetched", user);
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const profile = await userService.updateProfile(req.user.uuid, req.body);
    return sendSuccess(res, 200, "Profile updated", profile);
  } catch (err) {
    next(err);
  }
};

module.exports = { getMe, updateProfile };

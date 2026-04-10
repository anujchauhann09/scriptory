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
    const { name, bio, avatarUrl } = req.body;
    const profile = await userService.updateProfile(req.user.uuid, { name, bio, avatarUrl });
    return sendSuccess(res, 200, "Profile updated", profile);
  } catch (err) {
    next(err);
  }
};

module.exports = { getMe, updateProfile };

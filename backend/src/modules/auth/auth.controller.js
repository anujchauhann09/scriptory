const authService = require("./auth.service");
const { registerSchema, loginSchema } = require("./auth.validation");
const { sendSuccess, sendError } = require("../../utils/response");

const register = async (req, res, next) => {
  try {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    const result = await authService.register(value);
    return sendSuccess(res, 201, "Account created successfully", result);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return sendError(res, 400, "Validation failed", error.details.map((d) => d.message));
    }

    const result = await authService.login(value);
    return sendSuccess(res, 200, "Login successful", result);
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login };

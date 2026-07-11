const Joi = require("joi");

// at least 8 chars, with at least one letter and one number
const password = Joi.string()
  .min(8)
  .max(128)
  .pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)
  .messages({
    "string.pattern.base": "Password must contain at least one letter and one number",
    "string.min": "Password must be at least 8 characters",
  });

const totpCode = Joi.string()
  .pattern(/^\d{6}$/)
  .messages({ "string.pattern.base": "Enter the 6-digit code from your authenticator app" });

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: password.required(),
  name: Joi.string().max(100).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  totp: totpCode.optional(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});

const codeSchema = Joi.object({
  code: totpCode.required(),
});

module.exports = { registerSchema, loginSchema, changePasswordSchema, codeSchema };

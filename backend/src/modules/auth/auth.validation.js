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

// `tlds: false` keeps Joi from rejecting valid addresses on new or internal
// TLDs; the format check is what matters here, not a registry lookup.
const email = Joi.string().trim().lowercase().email({ tlds: false }).max(255);

const registerSchema = Joi.object({
  email: email.required(),
  password: password.required(),
  name: Joi.string().trim().max(100).optional().allow(""),
});

const loginSchema = Joi.object({
  email: email.required(),
  // Bounded so a multi-megabyte string cannot be pushed through bcrypt; the
  // length is deliberately not validated against the registration rules, which
  // would tell an attacker when a guess had the right shape.
  password: Joi.string().max(200).required(),
  totp: totpCode.optional().allow(""),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: password.required(),
});

const codeSchema = Joi.object({
  code: totpCode.required(),
});

module.exports = { registerSchema, loginSchema, changePasswordSchema, codeSchema };

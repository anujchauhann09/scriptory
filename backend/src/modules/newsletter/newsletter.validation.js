const Joi = require("joi");

const subscribeSchema = Joi.object({
  email: Joi.string().trim().email().max(255).required(),
  // honeypot: real users leave this empty. Accepted but dropped in the controller
  company: Joi.string().allow("").max(255).optional(),
});

module.exports = { subscribeSchema };

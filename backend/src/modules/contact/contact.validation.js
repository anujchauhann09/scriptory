const Joi = require("joi");

const contactSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().trim().email().max(255).required(),
  message: Joi.string().trim().min(5).max(5000).required(),
  // honeypot: real users never fill this. Accepted but dropped in the controller
  company: Joi.string().allow("").max(255).optional(),
});

module.exports = { contactSchema };

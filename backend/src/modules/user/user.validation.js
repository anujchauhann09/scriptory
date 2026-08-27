const Joi = require("joi");

/**
 * Avatar URLs are rendered directly into an <img src> on every page the user
 * appears on. Restricting the scheme to http/https stops `javascript:` and
 * `data:text/html` values being stored — the profile endpoint previously
 * accepted any string at all, which made it a persistent injection sink
 * reachable by any registered user.
 */
const avatarUrl = Joi.string().trim().uri({ scheme: ["http", "https"] }).max(2048);

const updateProfileSchema = Joi.object({
  // Bounded because these render in comment threads and author bylines, and
  // because an unbounded bio is free storage for anyone with an account.
  name: Joi.string().trim().max(100).optional().allow("", null),
  bio: Joi.string().trim().max(1000).optional().allow("", null),
  avatarUrl: avatarUrl.optional().allow("", null),
})
  .min(1)
  .messages({ "object.min": "Provide at least one field to update" });

module.exports = { updateProfileSchema };

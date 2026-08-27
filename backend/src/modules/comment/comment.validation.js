const Joi = require("joi");

/**
 * Comments are free-text from any signed-in user. The length cap is the control
 * that stops one account writing megabytes into a table that is read back on
 * every article view; 2000 characters is well past any real comment.
 */
const createCommentSchema = Joi.object({
  content: Joi.string().trim().min(1).max(2000).required().messages({
    "string.empty": "Comment content is required",
    "any.required": "Comment content is required",
  }),
});

/**
 * The thread was previously returned in full, with no bound at all. A page size
 * is necessary — one popular article should not mean an unbounded response on
 * every load — but the default is set high enough that real threads arrive
 * whole, and the total travels back in X-Total-Count so a client can tell when
 * there is more.
 */
const listCommentsSchema = Joi.object({
  page: Joi.number().integer().min(1).max(1000).default(1),
  limit: Joi.number().integer().min(1).max(200).default(100),
});

module.exports = { createCommentSchema, listCommentsSchema };

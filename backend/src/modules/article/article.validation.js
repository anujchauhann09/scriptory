const Joi = require("joi");

const createArticleSchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  subtitle: Joi.string().max(300).optional().allow(""),
  content: Joi.string().min(10).required(),
  excerpt: Joi.string().max(500).optional().allow(""),
  coverImage: Joi.string().uri().optional().allow(""),
  published: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
});

const updateArticleSchema = Joi.object({
  title: Joi.string().min(3).max(200).optional(),
  subtitle: Joi.string().max(300).optional().allow(""),
  content: Joi.string().min(10).optional(),
  excerpt: Joi.string().max(500).optional().allow(""),
  coverImage: Joi.string().uri().optional().allow("", null),
  published: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string().max(50)).optional(),
});

const listArticlesSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  tag: Joi.string().optional(),
  search: Joi.string().optional(),
  published: Joi.boolean().optional(),
});

module.exports = { createArticleSchema, updateArticleSchema, listArticlesSchema };

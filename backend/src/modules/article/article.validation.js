const Joi = require("joi");
const { normaliseArticleContentSource } = require("./contentContract");

/**
 * Content is stored as HTML and rendered into the reader's page, so the size
 * ceiling here is a real availability control, not just tidiness: it bounds what
 * a single row can cost to store, transfer on every read, and sanitise on
 * write. 512KB is far more than any hand-written article and far less than the
 * body-parser limit.
 */
const MAX_CONTENT_BYTES = 512 * 1024;

const content = Joi.string().min(10).max(MAX_CONTENT_BYTES);

const contentSource = Joi.any().custom((value, helpers) => {
  try {
    return normaliseArticleContentSource(value);
  } catch (err) {
    return helpers.message(err.message);
  }
});

/**
 * Cover images are rendered into an <img src>. Constraining the scheme stops a
 * `javascript:` or `data:text/html` URL being stored and later executed by a
 * client that resolves it in a context where that matters.
 */
const imageUrl = Joi.string().uri({ scheme: ["http", "https"] }).max(2048);

const tags = Joi.array().items(Joi.string().trim().min(1).max(50)).max(10);

/**
 * Category slug.
 *
 * Optional everywhere, and allowed to be "" or null so the editor can clear it.
 * Only the shape is checked here; whether the slug names a real category is
 * settled against the database, because the taxonomy is data, not a constant
 * this file should have to stay in sync with.
 */
const categorySlug = Joi.string()
  .trim()
  .lowercase()
  .max(60)
  .pattern(/^[a-z0-9-]+$/)
  .messages({ "string.pattern.base": "Category must be a slug, e.g. \"system-design\"" });

const createArticleSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  subtitle: Joi.string().trim().max(300).optional().allow(""),
  content: content.required(),
  contentSource: contentSource.optional().allow(null),
  excerpt: Joi.string().trim().max(500).optional().allow(""),
  coverImage: imageUrl.optional().allow(""),
  published: Joi.boolean().optional(),
  tags: tags.optional(),
  series: Joi.string().trim().max(120).optional().allow("", null),
  seriesOrder: Joi.number().integer().min(1).max(999).optional().allow(null),
  publishAt: Joi.date().iso().optional().allow(null),
  // Optional by design: an article may be published with no category at all.
  category: categorySlug.optional().allow("", null),
});

const updateArticleSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  subtitle: Joi.string().trim().max(300).optional().allow(""),
  content: content.optional(),
  contentSource: contentSource.optional().allow(null),
  excerpt: Joi.string().trim().max(500).optional().allow(""),
  coverImage: imageUrl.optional().allow("", null),
  published: Joi.boolean().optional(),
  tags: tags.optional(),
  series: Joi.string().trim().max(120).optional().allow("", null),
  seriesOrder: Joi.number().integer().min(1).max(999).optional().allow(null),
  publishAt: Joi.date().iso().optional().allow(null),
  // Sending only this field re-files an article without touching its content —
  // the intended way to organise a back catalogue after the fact.
  category: categorySlug.optional().allow("", null),
})
  // An empty PUT would otherwise reach Prisma as `data: {}` and touch
  // updatedAt for no reason.
  .min(1);

const listArticlesSchema = Joi.object({
  page: Joi.number().integer().min(1).max(1000).default(1),
  // The upper bound is what stops `?limit=100000` turning one request into a
  // full table scan plus a multi-megabyte response.
  limit: Joi.number().integer().min(1).max(50).default(10),
  tag: Joi.string().trim().max(50).optional(),
  // Long search strings cost Postgres real work in websearch_to_tsquery and
  // buy the user nothing.
  search: Joi.string().trim().max(100).optional().allow(""),
  // Honoured for admins only; the service ignores it for everyone else.
  published: Joi.boolean().optional(),
  category: categorySlug.optional().allow(""),
  // "Which articles still need filing?" — the question that drives categorising
  // an existing back catalogue. A separate flag rather than a reserved slug so
  // it cannot collide with a real category added later.
  uncategorized: Joi.boolean().optional(),
});

/** Path parameters, validated so a malformed identifier never reaches a query. */
const slugParamSchema = Joi.object({
  slug: Joi.string().trim().max(200).pattern(/^[a-zA-Z0-9._~-]+$/).required(),
}).unknown(true);

const uuidParamSchema = Joi.object({
  uuid: Joi.string().guid({ version: ["uuidv4"] }).required(),
}).unknown(true);

module.exports = {
  createArticleSchema,
  updateArticleSchema,
  listArticlesSchema,
  slugParamSchema,
  uuidParamSchema,
  MAX_CONTENT_BYTES,
};

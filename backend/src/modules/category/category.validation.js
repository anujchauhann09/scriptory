const Joi = require("joi");

/**
 * A category is part of the site's public structure — its name appears in
 * navigation and its slug appears in URLs — so the bounds here are about
 * keeping the taxonomy legible, not just about rejecting garbage.
 */
const name = Joi.string().trim().min(2).max(60);

/**
 * Slugs are URL identifiers. Lowercase, hyphenated, no leading/trailing or
 * doubled hyphens, so what goes in the address bar is predictable.
 */
const slug = Joi.string()
  .trim()
  .lowercase()
  .min(2)
  .max(60)
  .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .messages({
    "string.pattern.base":
      'Slug must be lowercase letters, numbers and single hyphens, e.g. "system-design"',
  });

const description = Joi.string().trim().max(300).allow("", null);

const createCategorySchema = Joi.object({
  name: name.required(),
  // Derived from the name when omitted, which is the normal path.
  slug: slug.optional(),
  description: description.optional(),
});

const updateCategorySchema = Joi.object({
  name: name.optional(),
  // Editable, but it is the one field that can break an existing link, so the
  // UI warns before sending it.
  slug: slug.optional(),
  description: description.optional(),
})
  .min(1)
  .messages({ "object.min": "Provide at least one field to update" });

/**
 * Reordering sends the complete desired order rather than a single position.
 *
 * One request describing the whole list is atomic and idempotent: there is no
 * intermediate state where two categories share a position, and replaying it
 * changes nothing. Nudging one item at a time would need several requests and
 * could leave the order half-applied if one failed.
 */
const reorderCategoriesSchema = Joi.object({
  order: Joi.array().items(slug.required()).min(1).max(50).unique().required().messages({
    "array.unique": "The same category appears twice in the requested order",
  }),
});

const slugParamSchema = Joi.object({ slug: slug.required() }).unknown(true);

module.exports = {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  slugParamSchema,
};

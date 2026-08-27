const categoryService = require("./category.service");
const { validated } = require("../../middleware/validate.middleware");
const { sendSuccess } = require("../../utils/response");
const { logAudit } = require("../../utils/audit");

/** Shared audit context for taxonomy changes. */
const actor = (req) => ({
  actorUuid: req.user.uuid,
  actorEmail: req.user.email,
  ip: req.ip,
});

// PUBLIC
const listCategories = async (req, res, next) => {
  try {
    const categories = await categoryService.listCategories();
    /**
     * Short browser cache on purpose.
     *
     * The server-side memo is what protects the database, and it is invalidated
     * the moment an admin changes the taxonomy. A browser cache cannot be
     * invalidated that way, so a long max-age would leave an admin who just
     * created a category unable to select it in the editor for minutes. Sixty
     * seconds keeps the request cheap without that surprise.
     */
    res.set("Cache-Control", "public, max-age=60");
    return sendSuccess(res, 200, "Categories fetched", categories);
  } catch (err) {
    next(err);
  }
};

// ADMIN
const listForAdmin = async (req, res, next) => {
  try {
    const categories = await categoryService.listCategoriesForAdmin();
    // Includes draft counts, so it must not be cached by a proxy.
    res.set("Cache-Control", "no-store");
    return sendSuccess(res, 200, "Categories fetched", categories);
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await categoryService.createCategory(req.body);
    logAudit("category.create", { ...actor(req), detail: category.slug });
    return sendSuccess(res, 201, `Category "${category.name}" created`, category);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { slug } = validated(req, "params");
    const category = await categoryService.updateCategory(slug, req.body);
    logAudit("category.update", {
      ...actor(req),
      detail: category.slugChanged ? `${category.previousSlug} -> ${category.slug}` : category.slug,
    });

    // A changed slug is the one edit that can break something outside the app,
    // so it is called out rather than left for the admin to discover.
    const message = category.slugChanged
      ? `Category updated. Links using "?category=${category.previousSlug}" will no longer match.`
      : "Category updated";
    return sendSuccess(res, 200, message, category);
  } catch (err) {
    next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const { slug } = validated(req, "params");
    const result = await categoryService.deleteCategory(slug);
    logAudit("category.delete", {
      ...actor(req),
      detail: `${result.slug} (unfiled ${result.unfiled})`,
    });

    // Stating what happened to the articles matters: the whole point of the
    // nullable relation is that they survive, and the admin should see that.
    const message = result.unfiled
      ? `Category "${result.name}" deleted. ${result.unfiled} article${result.unfiled === 1 ? "" : "s"} moved to uncategorised.`
      : `Category "${result.name}" deleted.`;
    return sendSuccess(res, 200, message, result);
  } catch (err) {
    next(err);
  }
};

const reorderCategories = async (req, res, next) => {
  try {
    const categories = await categoryService.reorderCategories(req.body.order);
    logAudit("category.reorder", { ...actor(req), detail: req.body.order.join(", ") });
    return sendSuccess(res, 200, "Learning path reordered", categories);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listCategories,
  listForAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};

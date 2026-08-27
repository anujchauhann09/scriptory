const { Router } = require("express");
const categoryController = require("./category.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  slugParamSchema,
} = require("./category.validation");

const router = Router();

// PUBLIC — the taxonomy is part of the site's navigation. Cached in-process
// and covered by the global API rate limit.
router.get("/", categoryController.listCategories);

/**
 * ADMIN — managing the taxonomy itself.
 *
 * Kept separate from the article write path on purpose: an article may only
 * reference a category that already exists, so writing a post can never create
 * one. Only an admin acting on these routes changes the vocabulary.
 *
 * "/manage" is declared before "/:slug" so the literal path is not swallowed by
 * the parameterised one.
 */
router.get("/manage", authMiddleware, adminMiddleware, categoryController.listForAdmin);

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(createCategorySchema),
  categoryController.createCategory
);

router.put(
  "/order",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(reorderCategoriesSchema),
  categoryController.reorderCategories
);

router.patch(
  "/:slug",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(slugParamSchema, "params"),
  validate(updateCategorySchema),
  categoryController.updateCategory
);

router.delete(
  "/:slug",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(slugParamSchema, "params"),
  categoryController.deleteCategory
);

module.exports = router;

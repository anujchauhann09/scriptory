const { Router } = require("express");
const articleController = require("./article.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");
const optionalAuth = require("../../middleware/optionalAuth.middleware");
const limits = require("../../middleware/rateLimit.middleware");
const { validate, validated } = require("../../middleware/validate.middleware");
const {
  createArticleSchema,
  updateArticleSchema,
  listArticlesSchema,
  slugParamSchema,
  uuidParamSchema,
} = require("./article.validation");

const router = Router();


// PUBLIC
// optionalAuth lets an admin see their own drafts through the same endpoint;
// the service, not the route, decides what each viewer is allowed.
router.get(
  "/",
  optionalAuth,
  validate(listArticlesSchema, "query"),
  // Search runs a full-text scan, so it carries its own tighter limit; plain
  // listing is a cheap indexed read and only needs the global one. The decision
  // reads the validated value, so it cannot diverge from what the service
  // actually does with the parameter.
  (req, res, next) =>
    validated(req, "query")?.search ? limits.search(req, res, next) : next(),
  articleController.listArticles
);
router.get(
  "/:slug/related",
  optionalAuth,
  validate(slugParamSchema, "params"),
  articleController.getRelated
);
router.get(
  "/:slug",
  optionalAuth,
  validate(slugParamSchema, "params"),
  articleController.getArticle
);

// ADMIN ONLY
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(createArticleSchema),
  articleController.createArticle
);
router.put(
  "/:uuid",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(uuidParamSchema, "params"),
  validate(updateArticleSchema),
  articleController.updateArticleByUuid
);
router.delete(
  "/:uuid",
  authMiddleware,
  adminMiddleware,
  limits.write,
  validate(uuidParamSchema, "params"),
  articleController.deleteArticleByUuid
);

module.exports = router;

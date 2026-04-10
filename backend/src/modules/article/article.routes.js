const { Router } = require("express");
const articleController = require("./article.controller");
const authMiddleware = require("../../middleware/auth.middleware");
const adminMiddleware = require("../../middleware/admin.middleware");

const router = Router();

// PUBLIC
router.get("/", articleController.listArticles);
router.get("/:slug", articleController.getArticle);

// ADMIN ONLY
router.post("/", authMiddleware, adminMiddleware, articleController.createArticle);
router.put("/:uuid", authMiddleware, adminMiddleware, articleController.updateArticleByUuid);
router.delete("/:uuid", authMiddleware, adminMiddleware, articleController.deleteArticleByUuid);

module.exports = router;

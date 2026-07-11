const { Router } = require("express");
const bookmarkController = require("./bookmark.controller");
const authMiddleware = require("../../middleware/auth.middleware");

// Article-scoped (mounted at /api/articles): status + toggle.
const articleBookmarkRoutes = Router();
articleBookmarkRoutes.get("/:slug/bookmark", authMiddleware, bookmarkController.status);
articleBookmarkRoutes.post("/:slug/bookmark", authMiddleware, bookmarkController.toggle);

// The signed-in user's saved list (mounted at /api/bookmarks).
const bookmarkListRoutes = Router();
bookmarkListRoutes.get("/", authMiddleware, bookmarkController.list);

module.exports = { articleBookmarkRoutes, bookmarkListRoutes };

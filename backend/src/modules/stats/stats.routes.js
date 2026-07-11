const { Router } = require("express");
const prisma = require("../../config/db");
const { sendSuccess } = require("../../utils/response");

const router = Router();

// PUBLIC — lightweight totals for the homepage stats strip.
router.get("/", async (req, res, next) => {
  try {
    const [articles, viewsAgg, topics] = await Promise.all([
      prisma.article.count({ where: { published: true } }),
      prisma.view.aggregate({ _sum: { count: true } }),
      prisma.tag.count({ where: { articles: { some: { article: { published: true } } } } }),
    ]);
    return sendSuccess(res, 200, "Stats fetched", {
      articles,
      views: viewsAgg._sum.count ?? 0,
      topics,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

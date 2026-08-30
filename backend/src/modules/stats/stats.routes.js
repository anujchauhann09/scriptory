const { Router } = require("express");
const prisma = require("../../config/db");
const memo = require("../../utils/memoCache");
const { sendSuccess } = require("../../utils/response");

const router = Router();

/**
 * The homepage requests this on every visit, and it runs three aggregates. The
 * numbers are a decorative stats strip, so a few minutes of staleness is
 * invisible to a reader and removes the query entirely from the hot path.
 */
const STATS_CACHE_TTL_MS = Number(process.env.STATS_CACHE_TTL_MS) || 5 * 60 * 1000;

// PUBLIC — lightweight totals for the homepage stats strip.
router.get("/", async (req, res, next) => {
  try {
    const data = await memo.remember("stats:site", STATS_CACHE_TTL_MS, async () => {
      const [articles, viewsAgg, topics] = await Promise.all([
        // Counts what a reader can actually find from the archive page, so the
        // strip never advertises more articles than the listing will show.
        prisma.article.count({ where: { published: true, archivedAt: null } }),
        prisma.view.aggregate({ _sum: { count: true } }),
        prisma.tag.count({
          where: { articles: { some: { article: { published: true, archivedAt: null } } } },
        }),
      ]);
      return { articles, views: viewsAgg._sum.count ?? 0, topics };
    });

    res.set("Cache-Control", "public, max-age=300");
    return sendSuccess(res, 200, "Stats fetched", data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const prisma = require("../../config/db");
const memo = require("../../utils/memoCache");

/**
 * The tag list is identical for every visitor and changes only when an article
 * is written, but it runs a correlated count per tag — so it is memoised for a
 * few minutes rather than recomputed on every navigation.
 */
const TAGS_CACHE_TTL_MS = Number(process.env.TAGS_CACHE_TTL_MS) || 5 * 60 * 1000;

const listTags = async () =>
  memo.remember("stats:tags", TAGS_CACHE_TTL_MS, async () => {
    const tags = await prisma.tag.findMany({
      where: {
        articles: {
          some: {
            article: { published: true },
          },
        },
      },
      orderBy: { name: "asc" },
      select: {
        name: true,
        _count: {
          select: {
            articles: {
              where: { article: { published: true } },
            },
          },
        },
      },
    });

    return tags.map(({ name, _count }) => ({
      name,
      articleCount: _count.articles,
    }));
  });

module.exports = { listTags };

const { Prisma } = require("@prisma/client");
const prisma = require("../../config/db");
const memo = require("../../utils/memoCache");

/**
 * Dashboard overview.
 *
 * Every query here is an unfiltered aggregate over a whole table, so the result
 * is memoised briefly - an admin holding down refresh should not be able to
 * schedule a dozen sequential scans of the view table.
 */
const OVERVIEW_CACHE_TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS) || 60 * 1000;

const getOverview = () => memo.remember("stats:analytics", OVERVIEW_CACHE_TTL_MS, computeOverview);

const computeOverview = async () => {
  const [
    articles,
    published,
    archived,
    comments,
    likes,
    subscribers,
    activeSubscribers,
    viewsAgg,
    topRaw,
    viewsByDay,
  ] = await Promise.all([
    prisma.article.count(),
    // "Published" means live: released and not retired. Counting archived posts
    // here would report more articles on the dashboard than the site shows.
    prisma.article.count({ where: { published: true, archivedAt: null } }),
    prisma.article.count({ where: { NOT: { archivedAt: null } } }),
    prisma.comment.count(),
    prisma.like.count(),
    prisma.subscriber.count(),
    prisma.subscriber.count({ where: { status: "SUBSCRIBED" } }),
    prisma.view.aggregate({ _sum: { count: true } }),
    prisma.article.findMany({
      orderBy: { views: { count: "desc" } },
      take: 5,
      select: { title: true, slug: true, views: { select: { count: true } } },
    }),
    prisma.$queryRaw(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, count(*)::int AS count
      FROM "ViewRecord"
      WHERE "createdAt" >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  return {
    totals: {
      articles,
      published,
      archived,
      /**
       * The three states partition the table — archived, live, and everything
       * else — so drafts falls out by subtraction and cannot double-count.
       *
       * Before archiving existed this was `articles - published`, which would
       * now file every retired post under "Drafts" and leave the tile climbing
       * for the rest of the blog's life.
       */
      drafts: articles - published - archived,
      views: viewsAgg._sum.count ?? 0,
      likes,
      comments,
      subscribers,
      activeSubscribers,
    },
    topArticles: topRaw.map((a) => ({ title: a.title, slug: a.slug, views: a.views?.count ?? 0 })),
    viewsByDay: viewsByDay.map((r) => ({ date: r.day, count: r.count })),
  };
};

module.exports = { getOverview };

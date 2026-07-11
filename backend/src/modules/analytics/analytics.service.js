const { Prisma } = require("@prisma/client");
const prisma = require("../../config/db");

const getOverview = async () => {
  const [
    articles,
    published,
    comments,
    likes,
    subscribers,
    activeSubscribers,
    viewsAgg,
    topRaw,
    viewsByDay,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { published: true } }),
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
      drafts: articles - published,
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

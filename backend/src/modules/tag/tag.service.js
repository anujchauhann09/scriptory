const prisma = require("../../config/db");

const listTags = async () => {
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
};

module.exports = { listTags };

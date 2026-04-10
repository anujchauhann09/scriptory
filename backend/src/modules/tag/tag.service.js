const prisma = require("../../config/db");


const listTags = async () => {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      _count: { select: { articles: true } },
    },
  });

  return tags.map(({ name, _count }) => ({
    name,
    articleCount: _count.articles,
  }));
};

module.exports = { listTags };

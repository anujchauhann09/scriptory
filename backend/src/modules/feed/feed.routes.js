const { Router } = require("express");
const prisma = require("../../config/db");
const config = require("../../config/env");

const router = Router();

const SITE = config.frontendUrl.replace(/\/$/, "");

const escapeXml = (str = "") =>
  str.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );

const publishedArticles = (limit) =>
  prisma.article.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { slug: true, title: true, excerpt: true, createdAt: true, updatedAt: true },
  });

// RSS 2.0 feed
router.get("/rss.xml", async (req, res, next) => {
  try {
    const articles = await publishedArticles(50);
    const items = articles
      .map(
        (a) => `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${SITE}/articles/${a.slug}</link>
      <guid isPermaLink="true">${SITE}/articles/${a.slug}</guid>
      <description>${escapeXml(a.excerpt || "")}</description>
      <pubDate>${new Date(a.createdAt).toUTCString()}</pubDate>
    </item>`
      )
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Scriptory</title>
    <link>${SITE}</link>
    <description>Backend engineering — system design, APIs, distributed systems, and production war stories.</description>
    <language>en</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

// XML sitemap
router.get("/sitemap.xml", async (req, res, next) => {
  try {
    const articles = await publishedArticles(1000);
    const staticPages = ["", "/articles", "/about", "/contact"];
    const urls = [
      ...staticPages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`),
      ...articles.map(
        (a) =>
          `  <url><loc>${SITE}/articles/${a.slug}</loc><lastmod>${new Date(
            a.updatedAt
          ).toISOString()}</lastmod></url>`
      ),
    ].join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.set("Content-Type", "application/xml; charset=utf-8");
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

// robots.txt
router.get("/robots.txt", (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  return res.send(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
});

module.exports = router;

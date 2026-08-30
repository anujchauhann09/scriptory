const { Router } = require("express");
const prisma = require("../../config/db");
const config = require("../../config/env");
const memo = require("../../utils/memoCache");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

const SITE = config.frontendUrl.replace(/\/$/, "");

/**
 * Feeds are polled by crawlers on a schedule and are identical for everyone, so
 * they are memoised and served with a public cache lifetime. Without this, a
 * sitemap request reads up to a thousand rows every time an aggregator checks.
 */
const FEED_CACHE_TTL_MS = Number(process.env.FEED_CACHE_TTL_MS) || 10 * 60 * 1000;

const escapeXml = (str = "") =>
  str.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );

// Archived posts are dropped from both feeds. The sitemap is the stronger case
// of the two: leaving a retired article in it asks search engines to keep
// ranking it, which is the opposite of what archiving is for. The URL itself
// stays reachable for anyone who already has the link.
const publishedArticles = (limit) =>
  prisma.article.findMany({
    where: { published: true, archivedAt: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { slug: true, title: true, excerpt: true, createdAt: true, updatedAt: true },
  });

// RSS 2.0 feed
router.get("/rss.xml", limits.feed, async (req, res, next) => {
  try {
    const xml = await memo.remember("feed:rss", FEED_CACHE_TTL_MS, async () => {
      const articles = await publishedArticles(50);
      const items = articles
        .map(
          (a) => `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${SITE}/articles/${escapeXml(a.slug)}</link>
      <guid isPermaLink="true">${SITE}/articles/${escapeXml(a.slug)}</guid>
      <description>${escapeXml(a.excerpt || "")}</description>
      <pubDate>${new Date(a.createdAt).toUTCString()}</pubDate>
    </item>`
        )
        .join("\n");

      return `<?xml version="1.0" encoding="UTF-8"?>
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
    });

    res.set("Content-Type", "application/rss+xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=600");
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

// XML sitemap
router.get("/sitemap.xml", limits.feed, async (req, res, next) => {
  try {
    const xml = await memo.remember("feed:sitemap", FEED_CACHE_TTL_MS, async () => {
      const articles = await publishedArticles(1000);
      const staticPages = ["", "/articles", "/about", "/contact"];
      const urls = [
        ...staticPages.map((p) => `  <url><loc>${SITE}${p}</loc></url>`),
        ...articles.map(
          (a) =>
            `  <url><loc>${SITE}/articles/${escapeXml(a.slug)}</loc><lastmod>${new Date(
              a.updatedAt
            ).toISOString()}</lastmod></url>`
        ),
      ].join("\n");

      return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
    });

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=600");
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

// robots.txt
router.get("/robots.txt", limits.feed, (req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.set("Cache-Control", "public, max-age=3600");
  // The API's own paths are not content and should never be indexed; the
  // unsubscribe path in particular must never be crawled with a live token.
  return res.send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /og/\n\nSitemap: ${SITE}/sitemap.xml\n`
  );
});

module.exports = router;

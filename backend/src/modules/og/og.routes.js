const { Router } = require("express");
const sharp = require("sharp");
const prisma = require("../../config/db");
const memo = require("../../utils/memoCache");
const limits = require("../../middleware/rateLimit.middleware");

const router = Router();

/**
 * Rasterising an SVG through sharp is by far the most CPU-expensive thing this
 * service does, and an un-cached one runs on every request. Cache misses are
 * rate limited, results are memoised in-process, and the response carries a
 * long public cache lifetime so a CDN or the social platform's own scraper
 * absorbs the repeats.
 */
const OG_CACHE_TTL_MS = Number(process.env.OG_CACHE_TTL_MS) || 60 * 60 * 1000;

const escapeXml = (s = "") =>
  s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );

// Greedy word-wrap for the title, capped at maxLines with an ellipsis.
function wrapTitle(title, maxChars = 24, maxLines = 3) {
  const words = title.split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = (cur ? cur + " " : "") + w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const rendered = lines.join(" ");
  if (rendered.length < title.replace(/\s+/g, " ").length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, "…");
  }
  return lines.slice(0, maxLines);
}

const renderCard = async (title, tag) => {
  const lines = wrapTitle(title);

  const lineHeight = 84;
  const blockHeight = lines.length * lineHeight;
  const startY = 340 - blockHeight / 2 + 60;
  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="90" y="${startY + i * lineHeight}" font-family="sans-serif" font-size="66" font-weight="800" fill="#ffffff">${escapeXml(l)}</text>`
    )
    .join("");

  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="20%" cy="0%" r="90%">
      <stop offset="0%" stop-color="#ef233c" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#0a0a0a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect y="626" width="1200" height="4" fill="#ef233c"/>
  <g transform="translate(90 78)">
    <rect x="0" y="0" width="30" height="30" rx="7" fill="#ef233c" transform="rotate(45 15 15)"/>
    <text x="46" y="24" font-family="sans-serif" font-size="34" font-weight="800" fill="#ffffff">Scriptory</text>
  </g>
  ${titleSvg}
  <text x="90" y="560" font-family="sans-serif" font-size="30" font-weight="600" fill="#ef233c">#${escapeXml(tag)}</text>
</svg>`;

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
};

// GET /og/:slug.png — a 1200×630 branded social preview image.
router.get("/:slug.png", limits.imageRender, async (req, res, next) => {
  try {
    const { slug } = req.params;

    // Path parameters reach a query, so bound and shape-check them first.
    if (!/^[a-zA-Z0-9._~-]{1,200}$/.test(slug)) {
      return res.status(400).json({ success: false, message: "Invalid slug" });
    }

    const png = await memo.remember(`og:${slug}`, OG_CACHE_TTL_MS, async () => {
      const article = await prisma.article.findFirst({
        // Published only: an unpublished title would otherwise be readable as an
        // image by anyone who guessed the slug, and would leak into link
        // previews the moment the URL was shared.
        where: { slug, published: true },
        select: { title: true, tags: { select: { tag: { select: { name: true } } }, take: 1 } },
      });

      const title = article ? article.title : "Scriptory";
      const tag = article?.tags?.[0]?.tag?.name || "backend engineering";
      return renderCard(title, tag);
    });

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    // These are meant to be embedded by other sites (social scrapers, link
    // previews), which the global same-origin CORP policy would otherwise block.
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    return res.send(png);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

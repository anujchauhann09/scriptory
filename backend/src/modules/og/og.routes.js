const { Router } = require("express");
const sharp = require("sharp");
const prisma = require("../../config/db");

const router = Router();

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

// GET /og/:slug.png — a 1200×630 branded social preview image.
router.get("/:slug.png", async (req, res, next) => {
  try {
    const article = await prisma.article.findFirst({
      where: { slug: req.params.slug },
      select: { title: true, tags: { select: { tag: { select: { name: true } } }, take: 1 } },
    });

    const title = article ? article.title : "Scriptory";
    const tag = article?.tags?.[0]?.tag?.name || "backend engineering";
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

    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(png);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

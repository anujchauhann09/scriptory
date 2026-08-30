/**
 * Regenerate article embeddings for the current EMBEDDING_MODEL.
 *
 *   node scripts/reembed.js [--all] [--dry-run]
 *
 * Needed whenever the model changes. Vectors are only comparable to others of
 * the same width, and `cosineSimilarity` scores a mismatched pair as -1 — so a
 * model switch does not degrade related posts, it disables them, silently and
 * with a full `embedding` column still sitting in the database.
 *
 * By default only rows whose width does not match the current model are
 * rewritten, which makes the script cheap to re-run and safe to leave in a
 * deploy step. `--all` forces every article, for when the model changed but the
 * width happened not to.
 *
 * Runs sequentially on purpose: this is a one-off backfill, and a burst of
 * parallel requests is the fastest way to hit an embedding rate limit.
 */
require("dotenv").config();
const prisma = require("../src/config/db");
const { generateEmbedding, embeddingsEnabled } = require("../src/utils/embedding");
const { sourceToPlainText } = require("../src/modules/article/contentContract");
const { stripAllHtml } = require("../src/utils/sanitizeHtml");

const FORCE = process.argv.includes("--all");
const DRY_RUN = process.argv.includes("--dry-run");

const buildText = (a) => {
  const body = sourceToPlainText(a.contentSource) || stripAllHtml(a.content || "");
  return [a.title, a.excerpt, body].filter(Boolean).join(". ").slice(0, 8000);
};

(async () => {
  if (!embeddingsEnabled) {
    console.error("GEMINI_API_KEY is not set — nothing to do. Related posts use the tag fallback.");
    process.exit(1);
  }

  // Establish the current model's width from a single throwaway call, so the
  // "does this row need rewriting?" test is a fact rather than a hardcoded
  // number that goes stale the next time the model changes.
  const probe = await generateEmbedding("dimension probe");
  if (!probe) {
    console.error("Could not generate a probe embedding — check EMBEDDING_MODEL and the API key.");
    process.exit(1);
  }
  const width = probe.length;
  console.log(`model=${process.env.EMBEDDING_MODEL || "gemini-embedding-2"} dims=${width}`);

  const articles = await prisma.article.findMany({
    select: { uuid: true, title: true, excerpt: true, content: true, contentSource: true, embedding: true },
    orderBy: { createdAt: "asc" },
  });

  const stale = articles.filter(
    (a) => FORCE || !Array.isArray(a.embedding) || a.embedding.length !== width
  );
  console.log(`${articles.length} article(s), ${stale.length} to (re)embed${DRY_RUN ? " [dry run]" : ""}\n`);

  let done = 0, failed = 0;
  for (const a of stale) {
    const label = a.title.slice(0, 58);
    if (DRY_RUN) { console.log(`  would embed  ${label}`); continue; }
    const vec = await generateEmbedding(buildText(a));
    if (!vec) { failed++; console.log(`  FAILED       ${label}`); continue; }
    await prisma.article.update({ where: { uuid: a.uuid }, data: { embedding: vec } });
    done++;
    console.log(`  ok (${vec.length})  ${label}`);
  }

  if (!DRY_RUN) console.log(`\nre-embedded ${done}, failed ${failed}`);
  if (failed) process.exitCode = 1;
})()
  .catch((e) => { console.error("reembed failed:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());

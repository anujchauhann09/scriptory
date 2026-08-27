const logger = require("./logger");
const { readSecret } = require("../config/secrets");

// Content-similarity embeddings via Gemini. Gracefully no-ops when GEMINI_API_KEY
// is unset — callers then fall back to tag-based related posts.
//
// This key is server-side only. It was previously also injected into the
// frontend bundle by the Vite config, which published it to every visitor;
// that injection is gone and the key now exists in exactly one place.
const API_KEY = readSecret("GEMINI_API_KEY");
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-004";

let client = null;
const isEnabled = Boolean(API_KEY);
if (isEnabled) {
  try {
    const { GoogleGenAI } = require("@google/genai");
    client = new GoogleGenAI({ apiKey: API_KEY });
  } catch (err) {
    logger.warn(`Embeddings disabled — could not init Gemini: ${err.message}`);
  }
}

const stripHtml = (html = "") =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Returns a number[] embedding, or null if unavailable/failed.
const generateEmbedding = async (text) => {
  if (!client || !text) return null;
  try {
    const input = text.slice(0, 8000); // keep request small
    const res = await client.models.embedContent({ model: MODEL, contents: input });
    const values = res?.embeddings?.[0]?.values || res?.embedding?.values || null;
    return Array.isArray(values) ? values : null;
  } catch (err) {
    logger.error(`Embedding generation failed: ${err.message}`);
    return null;
  }
};

const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

module.exports = { generateEmbedding, cosineSimilarity, stripHtml, embeddingsEnabled: isEnabled };

const test = require("node:test");
const assert = require("node:assert/strict");
const { normaliseArticleContentSource, sourceToPlainText } = require("../src/modules/article/contentContract");

test("normalises a valid hybrid article source", () => {
  const source = normaliseArticleContentSource({
    version: 1,
    format: "hybrid",
    blocks: [
      { type: "markdown", markdown: "# Hello\n\nBody" },
      { type: "image", src: "https://cdn.example.com/media/sample.gif", alt: "Demo animation", caption: "A useful GIF" },
      { type: "video", provider: "youtube", id: "dQw4w9WgXcQ", title: "Demo video" },
      { type: "callout", tone: "tip", content: "Prefer boring queues." },
      { type: "diagram", engine: "mermaid", source: "graph TD; A-->B;" },
      { type: "richLink", url: "https://example.com/post", title: "Example" },
    ],
  });

  assert.equal(source.version, 1);
  assert.equal(source.format, "hybrid");
  assert.equal(source.blocks.length, 6);
  assert.match(sourceToPlainText(source), /Prefer boring queues/);
});

test("rejects unsafe or unknown structured content", () => {
  assert.throws(
    () => normaliseArticleContentSource({ version: 1, format: "hybrid", blocks: [{ type: "video", provider: "twitch", id: "abc123" }] }),
    /Video provider/
  );

  assert.throws(
    () => normaliseArticleContentSource({ version: 1, format: "hybrid", blocks: [{ type: "image", src: "javascript:alert(1)", alt: "x" }] }),
    /Image source/
  );

  assert.throws(
    () => normaliseArticleContentSource({ version: 1, format: "hybrid", blocks: [{ type: "script", code: "alert(1)" }] }),
    /Unknown article content block type/
  );
});

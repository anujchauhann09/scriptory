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
      { type: "videoFile", src: "https://api.example.com/api/media/video-token", title: "Uploaded demo", caption: "MP4 demo" },
      { type: "callout", tone: "tip", content: "Prefer boring queues." },
      { type: "diagram", engine: "mermaid", source: "graph TD; A-->B;" },
      { type: "richLink", url: "https://example.com/post", title: "Example" },
    ],
  });

  assert.equal(source.version, 1);
  assert.equal(source.format, "hybrid");
  assert.equal(source.blocks.length, 7);
  assert.match(sourceToPlainText(source), /Prefer boring queues/);
});

test("normalises animation blocks and requires alt text", () => {
  const source = normaliseArticleContentSource({
    version: 1,
    format: "hybrid",
    blocks: [
      {
        type: "animation",
        src: "https://api.example.com/api/media/anim-token",
        alt: "Rebalance animation",
        caption: "Partitions moving between consumers",
      },
    ],
  });

  assert.equal(source.blocks[0].type, "animation");
  assert.equal(source.blocks[0].alt, "Rebalance animation");
  // Indexed for search the same way an image's alt text is.
  assert.match(sourceToPlainText(source), /Rebalance animation/);

  assert.throws(
    () => normaliseArticleContentSource({
      version: 1,
      format: "hybrid",
      blocks: [{ type: "animation", src: "https://api.example.com/api/media/anim-token" }],
    }),
    /Animation blocks require alt text/
  );
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
    () => normaliseArticleContentSource({ version: 1, format: "hybrid", blocks: [{ type: "videoFile", src: "javascript:alert(1)" }] }),
    /Video source/
  );

  assert.throws(
    () => normaliseArticleContentSource({ version: 1, format: "hybrid", blocks: [{ type: "script", code: "alert(1)" }] }),
    /Unknown article content block type/
  );
});

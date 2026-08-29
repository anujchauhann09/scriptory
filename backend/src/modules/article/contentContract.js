const MAX_BLOCKS = 120;
const MAX_MARKDOWN_CHARS = 512 * 1024;
const MAX_TEXT_CHARS = 100 * 1024;
const URL_RE = /^https?:\/\/[^\s<>"']{1,2048}$/i;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,80}$/;
const VIMEO_ID_RE = /^[0-9]{6,20}$/;

const fail = (message) => {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
};

const stringOrEmpty = (value) => (typeof value === "string" ? value.trim() : "");

const optionalString = (value, max = 500) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail("Content block metadata must be text");
  const text = value.trim();
  if (text.length > max) fail("Content block metadata is too long");
  return text || undefined;
};

const withOptional = (target, key, value) => {
  if (value !== undefined) target[key] = value;
  return target;
};

const assertUrl = (url, label) => {
  const value = stringOrEmpty(url);
  if (!URL_RE.test(value)) fail(`${label} must be an http(s) URL`);
  return value;
};

const normaliseBlock = (block) => {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    fail("Content blocks must be objects");
  }

  switch (block.type) {
    case "markdown": {
      if (typeof block.markdown !== "string") fail("Markdown blocks require markdown text");
      if (block.markdown.length > MAX_MARKDOWN_CHARS) fail("Markdown block is too large");
      return { type: "markdown", markdown: block.markdown };
    }
    case "image": {
      const alt = optionalString(block.alt, 300);
      if (!alt) fail("Image blocks require alt text");
      const out = { type: "image", src: assertUrl(block.src, "Image source"), alt };
      withOptional(out, "caption", optionalString(block.caption, 500));
      withOptional(out, "publicId", optionalString(block.publicId, 300));
      if (Number.isInteger(block.width) && block.width > 0) out.width = block.width;
      if (Number.isInteger(block.height) && block.height > 0) out.height = block.height;
      return out;
    }
    case "video": {
      const provider = block.provider === "youtube" || block.provider === "vimeo" ? block.provider : null;
      if (!provider) fail("Video provider must be youtube or vimeo");
      const id = stringOrEmpty(block.id);
      if (provider === "youtube" && !VIDEO_ID_RE.test(id)) fail("YouTube video id is invalid");
      if (provider === "vimeo" && !VIMEO_ID_RE.test(id)) fail("Vimeo video id is invalid");
      const out = { type: "video", provider, id };
      withOptional(out, "title", optionalString(block.title, 200));
      withOptional(out, "caption", optionalString(block.caption, 500));
      return out;
    }
    case "videoFile": {
      const out = { type: "videoFile", src: assertUrl(block.src, "Video source") };
      withOptional(out, "title", optionalString(block.title, 200));
      withOptional(out, "caption", optionalString(block.caption, 500));
      withOptional(out, "publicId", optionalString(block.publicId, 300));
      if (block.poster) out.poster = assertUrl(block.poster, "Video poster");
      return out;
    }
    case "code": {
      if (typeof block.code !== "string" || block.code.length > MAX_TEXT_CHARS) {
        fail("Code blocks require code text");
      }
      const out = { type: "code", code: block.code };
      withOptional(out, "language", optionalString(block.language, 40));
      withOptional(out, "filename", optionalString(block.filename, 200));
      return out;
    }
    case "callout": {
      const tone = ["note", "tip", "warning", "important"].includes(block.tone) ? block.tone : null;
      if (!tone) fail("Callout tone is invalid");
      if (typeof block.content !== "string" || block.content.length > MAX_TEXT_CHARS) {
        fail("Callouts require text content");
      }
      return { type: "callout", tone, content: block.content };
    }
    case "diagram": {
      if (block.engine !== "mermaid") fail("Only Mermaid diagrams are supported");
      if (typeof block.source !== "string" || block.source.length > MAX_TEXT_CHARS) {
        fail("Diagram blocks require source text");
      }
      return { type: "diagram", engine: "mermaid", source: block.source };
    }
    case "richLink": {
      const out = { type: "richLink", url: assertUrl(block.url, "Rich link URL") };
      withOptional(out, "title", optionalString(block.title, 200));
      withOptional(out, "description", optionalString(block.description, 500));
      if (block.image) out.image = assertUrl(block.image, "Rich link image");
      return out;
    }
    case "layout": {
      if (block.variant !== "sideBySide" || !Array.isArray(block.blocks) || block.blocks.length !== 2) {
        fail("Layout blocks require a supported variant and two child blocks");
      }
      const blocks = block.blocks.map(normaliseBlock);
      if (blocks.some((child) => child.type === "layout")) fail("Nested layout blocks are not supported");
      return { type: "layout", variant: "sideBySide", blocks };
    }
    default:
      fail("Unknown article content block type");
  }
};

const normaliseArticleContentSource = (value) => {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Article content source must be an object");
  }
  if (value.version !== 1 || value.format !== "hybrid") {
    fail("Unsupported article content source version");
  }
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || value.blocks.length > MAX_BLOCKS) {
    fail("Article content source requires 1-120 blocks");
  }
  return {
    version: 1,
    format: "hybrid",
    blocks: value.blocks.map(normaliseBlock),
  };
};

const sourceToPlainText = (source) => {
  if (!source || !Array.isArray(source.blocks)) return "";
  return source.blocks.map((block) => {
    if (block.type === "markdown") return block.markdown;
    if (block.type === "code") return block.code;
    if (block.type === "callout") return block.content;
    if (block.type === "diagram") return block.source;
    if (block.type === "image") return [block.alt, block.caption].filter(Boolean).join(" ");
    if (block.type === "video") return [block.title, block.caption, block.provider, block.id].filter(Boolean).join(" ");
    if (block.type === "videoFile") return [block.title, block.caption, block.src].filter(Boolean).join(" ");
    if (block.type === "richLink") return [block.title, block.description, block.url].filter(Boolean).join(" ");
    if (block.type === "layout") return sourceToPlainText({ blocks: block.blocks });
    return "";
  }).join("\n\n");
};

module.exports = { normaliseArticleContentSource, sourceToPlainText };

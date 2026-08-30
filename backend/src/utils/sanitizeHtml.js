const sanitize = require("sanitize-html");

/**
 * Server-side sanitisation of authored article HTML.
 *
 * The editor converts Markdown to HTML in the browser and sanitises it there,
 * but a client-side sanitiser is a formatting nicety, not a security control:
 * the API accepts whatever HTML is posted to it, and anyone with an admin
 * session (or an admin session hijacked by other means) can post raw
 * `<script>`. Editing an existing article bypassed the client sanitiser
 * entirely, because the stored HTML was sent back unchanged.
 *
 * Sanitising on write makes the stored content trustworthy no matter how it got
 * there, which is the only place the guarantee can actually hold. The reader
 * sanitises again on render, so a row written before this existed is still safe
 * to display.
 *
 * The allowlist mirrors what the Markdown pipeline can legitimately produce —
 * anything outside it was never reachable through the editor anyway.
 */

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "blockquote", "pre", "code", "span", "div",
  "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "sub", "sup",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "a", "img", "video", "source", "figure", "figcaption",
  "details", "summary",
];

/**
 * `class` is allowed because syntax highlighting, callouts and Mermaid blocks
 * are all class-driven. `style` is NOT: inline styles are an XSS vector in
 * their own right (historically via `expression()`, still via positioning a
 * transparent overlay over the page for clickjacking) and the design system
 * covers every legitimate need.
 */
const ALLOWED_ATTRIBUTES = {
  a: ["href", "title", "target", "rel", "name", "id"],
  img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
  // autoplay/loop/muted/playsinline are what make a WebM behave like the GIF it
  // replaces. They are inert markup — none of them can run script — and muted
  // is load-bearing rather than cosmetic: browsers block autoplay outright
  // without it, so dropping it would leave the animation frozen on frame one.
  video: [
    "src", "title", "controls", "preload", "poster", "width", "height",
    "autoplay", "loop", "muted", "playsinline",
  ],
  source: ["src", "type"],
  code: ["class"],
  pre: ["class"],
  span: ["class"],
  div: ["class"],
  // Article media wraps itself in <figure class="article-animation"> /
  // "article-video", and that class is the only thing the stylesheet has to
  // hook onto. Without it here the tag survives sanitising but arrives
  // unstyled, so an animation renders at intrinsic size with no rounding.
  figure: ["class"],
  p: ["class"],
  details: ["open", "class"],
  summary: ["class"],
  th: ["colspan", "rowspan", "scope", "align"],
  td: ["colspan", "rowspan", "align"],
  "*": ["id"],
};

const options = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  // Anything not on this list — javascript:, vbscript:, file: — is dropped.
  // `data:` is excluded for links and constrained for images below.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"], video: ["http", "https"], source: ["http", "https"] },
  allowedSchemesAppliedToAttributes: ["href", "src", "cite"],
  // A protocol-relative URL inherits the page's scheme and slips past naive
  // scheme checks; requiring an explicit protocol removes that class entirely.
  allowProtocolRelative: false,
  // Content inside a dropped tag goes too, so `<script>alert(1)</script>` does
  // not leave `alert(1)` behind as visible text.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  enforceHtmlBoundary: true,
  transformTags: {
    // Every outbound link opens in a new tab, and `noopener` is what stops the
    // opened page from reaching back through window.opener to redirect this one.
    a: (tagName, attribs) => {
      const href = attribs.href || "";
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          ...(isExternal ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: attribs.loading || "lazy", decoding: "async" },
    }),
  },
};

/** Sanitises authored HTML. Returns "" for non-string input. */
const sanitizeArticleHtml = (html) => (typeof html === "string" ? sanitize(html, options) : "");

/**
 * Strips every tag, for plain-text contexts (excerpts, embeddings, search
 * previews) where markup would only ever be noise or an injection vector.
 */
const stripAllHtml = (html) =>
  typeof html === "string"
    ? sanitize(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim()
    : "";

module.exports = { sanitizeArticleHtml, stripAllHtml };

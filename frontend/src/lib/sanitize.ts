import DOMPurify, { type Config } from 'dompurify';

/**
 * Sanitises stored article HTML before it is injected into the page.
 *
 * Article bodies are written as Markdown, converted to HTML in the editor, and
 * stored as HTML — so by the time the reader loads one, it is markup that goes
 * straight into `dangerouslySetInnerHTML`. The editor's own sanitising pass does
 * not protect this path: it never runs when an existing article is edited, and
 * it is client-side code that the API does not depend on at all.
 *
 * The API now sanitises on write, which is the authoritative fix. This is the
 * second half of the same guarantee: rows written before that existed, or by any
 * route that bypasses the editor, are still safe to render.
 *
 * The allowlist mirrors the server's so a legitimate article looks identical
 * either side of the boundary.
 */
const CONFIG: Config = {
  ADD_TAGS: ['details', 'summary', 'video', 'source'],
  ADD_ATTR: ['target', 'rel', 'open', 'controls', 'preload', 'poster', 'type'],
  // Inline styles are dropped: they can position an invisible overlay across the
  // page, which is a clickjacking primitive that needs no script at all.
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
  // Keeps `javascript:` and `data:text/html` out of href/src.
  ALLOW_DATA_ATTR: false,
};

let hooked = false;

/** Forces every external link to open safely, matching the server's transform. */
const installHook = () => {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof HTMLAnchorElement && /^https?:/i.test(node.getAttribute('href') || '')) {
      node.setAttribute('target', '_blank');
      // Without noopener the opened page can navigate this one via window.opener.
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
};

export function sanitizeArticleHtml(html: string | undefined | null): string {
  if (!html) return '';
  installHook();
  return DOMPurify.sanitize(html, CONFIG) as unknown as string;
}

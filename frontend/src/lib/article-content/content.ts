import { marked } from 'marked';
import DOMPurify from 'dompurify';

export type ArticleContentSource = {
  version: 1;
  format: 'hybrid';
  blocks: ArticleBlock[];
};

export type ArticleBlock =
  | { type: 'markdown'; markdown: string }
  | { type: 'image'; src: string; alt: string; caption?: string; publicId?: string; width?: number; height?: number }
  | { type: 'video'; provider: 'youtube' | 'vimeo'; id: string; title?: string; caption?: string }
  | { type: 'code'; language?: string; code: string; filename?: string }
  | { type: 'callout'; tone: 'note' | 'tip' | 'warning' | 'important'; content: string }
  | { type: 'diagram'; engine: 'mermaid'; source: string }
  | { type: 'richLink'; url: string; title?: string; description?: string; image?: string }
  | { type: 'layout'; variant: 'sideBySide'; blocks: Exclude<ArticleBlock, { type: 'layout' }>[] };

type Attrs = Record<string, string>;

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  important: 'Important',
  caution: 'Caution',
};

let configured = false;

function configureMarked() {
  if (configured) return;
  configured = true;
  marked.setOptions({ gfm: true, breaks: false });

  marked.use({
    extensions: [{
      name: 'callout',
      level: 'block' as const,
      start(src: string) {
        const m = src.match(/^>\s*\[!/m);
        return m ? m.index : undefined;
      },
      tokenizer(this: any, src: string) {
        const rule = /^(> *\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\][^\n]*\n(?:> ?[^\n]*\n?)*)/i;
        const match = rule.exec(src);
        if (!match) return undefined;
        const type = match[2].toLowerCase();
        const inner = match[1]
          .replace(/^> *\[![^\]]+\][^\n]*\n/, '')
          .replace(/^> ?/gm, '')
          .trim();
        const tokens = this.lexer.blockTokens(inner, []);
        return { type: 'callout', raw: match[1], calloutType: type, tokens };
      },
      renderer(this: any, token: any) {
        const body = this.parser.parse(token.tokens);
        return `<div class="callout callout-${token.calloutType}"><p class="callout-title">${CALLOUT_LABELS[token.calloutType]}</p>${body}</div>`;
      },
    }],
  });
}

export function markdownToHtml(markdown: string): string {
  configureMarked();
  const raw = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel', 'open'], ADD_TAGS: ['details', 'summary'] }) as unknown as string;
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeAttr = (value: string) => escapeHtml(value).replace(/`/g, '&#96;');

const decodeAttr = (value: string) => value
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

const encodeDirectiveAttr = (value: string) => escapeHtml(value).replace(/`/g, '&#96;');

const parseAttrs = (raw: string): Attrs => {
  const attrs: Attrs = {};
  const re = /([a-zA-Z][\w-]*)=("([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    attrs[match[1]] = decodeAttr(match[3] ?? match[4] ?? match[5] ?? '');
  }
  return attrs;
};

const attrsToText = (attrs: Attrs) => Object.entries(attrs)
  .filter(([, value]) => value !== undefined && value !== '')
  .map(([key, value]) => `${key}="${encodeDirectiveAttr(String(value))}"`)
  .join(' ');

function pushMarkdown(blocks: ArticleBlock[], markdown: string[]) {
  const text = markdown.join('\n').trim();
  if (text) blocks.push({ type: 'markdown', markdown: text });
  markdown.length = 0;
}

function parseDirective(name: string, attrs: Attrs, body: string): ArticleBlock | null {
  if (name === 'image' && attrs.src && attrs.alt) {
    return { type: 'image', src: attrs.src, alt: attrs.alt, ...(attrs.caption ? { caption: attrs.caption } : {}) };
  }
  if (name === 'video' && (attrs.provider === 'youtube' || attrs.provider === 'vimeo') && attrs.id) {
    return {
      type: 'video',
      provider: attrs.provider,
      id: attrs.id,
      ...(attrs.title ? { title: attrs.title } : {}),
      ...(attrs.caption ? { caption: attrs.caption } : {}),
    };
  }
  if (name === 'rich-link' && attrs.url) {
    return {
      type: 'richLink',
      url: attrs.url,
      ...(attrs.title ? { title: attrs.title } : {}),
      ...(attrs.description ? { description: attrs.description } : {}),
      ...(attrs.image ? { image: attrs.image } : {}),
    };
  }
  if (name === 'callout' && ['note', 'tip', 'warning', 'important'].includes(attrs.tone || '')) {
    return { type: 'callout', tone: attrs.tone as 'note' | 'tip' | 'warning' | 'important', content: body.trim() };
  }
  if (name === 'code') {
    return { type: 'code', code: body.replace(/\n$/, ''), ...(attrs.language ? { language: attrs.language } : {}), ...(attrs.filename ? { filename: attrs.filename } : {}) };
  }
  if (name === 'diagram' && (attrs.engine || 'mermaid') === 'mermaid') {
    return { type: 'diagram', engine: 'mermaid', source: body.trim() };
  }
  return null;
}

export function editorTextToContentSource(text: string): ArticleContentSource {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ArticleBlock[] = [];
  const markdown: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = /^:::\s*([a-zA-Z][\w-]*)(.*)$/.exec(lines[i]);
    if (!match) {
      markdown.push(lines[i]);
      continue;
    }

    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== ':::') end += 1;
    if (end >= lines.length) {
      markdown.push(lines[i]);
      continue;
    }

    const attrs = parseAttrs(match[2] || '');
    const body = lines.slice(i + 1, end).join('\n');
    const block = parseDirective(match[1], attrs, body);
    if (!block) {
      markdown.push(lines.slice(i, end + 1).join('\n'));
    } else {
      pushMarkdown(blocks, markdown);
      blocks.push(block);
    }
    i = end;
  }

  pushMarkdown(blocks, markdown);
  return { version: 1, format: 'hybrid', blocks: blocks.length ? blocks : [{ type: 'markdown', markdown: text }] };
}

export function contentSourceToEditorText(source: ArticleContentSource): string {
  return source.blocks.map((block) => {
    if (block.type === 'markdown') return block.markdown;
    if (block.type === 'image') return `:::image ${attrsToText({ src: block.src, alt: block.alt, caption: block.caption || '' })}\n:::`;
    if (block.type === 'video') return `:::video ${attrsToText({ provider: block.provider, id: block.id, title: block.title || '', caption: block.caption || '' })}\n:::`;
    if (block.type === 'richLink') return `:::rich-link ${attrsToText({ url: block.url, title: block.title || '', description: block.description || '', image: block.image || '' })}\n:::`;
    if (block.type === 'callout') return `:::callout ${attrsToText({ tone: block.tone })}\n${block.content}\n:::`;
    if (block.type === 'code') return `:::code ${attrsToText({ language: block.language || '', filename: block.filename || '' })}\n${block.code}\n:::`;
    if (block.type === 'diagram') return `:::diagram ${attrsToText({ engine: block.engine })}\n${block.source}\n:::`;
    if (block.type === 'layout') return block.blocks.map((child) => contentSourceToEditorText({ version: 1, format: 'hybrid', blocks: [child] })).join('\n\n');
    return '';
  }).filter(Boolean).join('\n\n');
}

export function contentSourceToHtml(source: ArticleContentSource): string {
  const html = source.blocks.map((block) => blockToHtml(block)).join('\n');
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'open'], ADD_TAGS: ['details', 'summary'] }) as unknown as string;
}

function blockToHtml(block: ArticleBlock): string {
  if (block.type === 'markdown') return markdownToHtml(block.markdown);
  if (block.type === 'image') {
    const img = `<img src="${escapeAttr(block.src)}" alt="${escapeAttr(block.alt)}" loading="lazy" decoding="async"${block.width ? ` width="${block.width}"` : ''}${block.height ? ` height="${block.height}"` : ''}>`;
    return `<figure>${img}${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if (block.type === 'video') {
    const label = block.title || `${block.provider} video`;
    const url = block.provider === 'youtube' ? `https://www.youtube.com/watch?v=${block.id}` : `https://vimeo.com/${block.id}`;
    return `<figure><p><a href="${escapeAttr(url)}">${escapeHtml(label)}</a></p>${block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : ''}</figure>`;
  }
  if (block.type === 'code') {
    const language = block.language ? ` class="language-${escapeAttr(block.language)}"` : '';
    return `<pre><code${language}>${escapeHtml(block.code)}</code></pre>`;
  }
  if (block.type === 'callout') {
    return `<div class="callout callout-${escapeAttr(block.tone)}"><p class="callout-title">${escapeHtml(CALLOUT_LABELS[block.tone])}</p>${markdownToHtml(block.content)}</div>`;
  }
  if (block.type === 'diagram') {
    return `<pre><code class="language-mermaid">${escapeHtml(block.source)}</code></pre>`;
  }
  if (block.type === 'richLink') {
    const title = block.title || block.url;
    return `<p><a href="${escapeAttr(block.url)}">${escapeHtml(title)}</a>${block.description ? ` - ${escapeHtml(block.description)}` : ''}</p>`;
  }
  if (block.type === 'layout') {
    return `<div class="content-layout content-layout-side-by-side">${block.blocks.map(blockToHtml).join('')}</div>`;
  }
  return '';
}

export function isArticleContentSource(value: unknown): value is ArticleContentSource {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as ArticleContentSource).version === 1 &&
    (value as ArticleContentSource).format === 'hybrid' &&
    Array.isArray((value as ArticleContentSource).blocks)
  );
}

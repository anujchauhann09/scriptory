import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { articlesApi, uploadApi, categoriesApi, type ArticlePayload, type ApiArticle, type ApiCategory } from '../lib/api';
import { clearCache } from '../lib/cache';
import { Container } from '../components/ui/Container';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { ImageUpload } from '../components/ui/ImageUpload';
import {
  Bold, Italic, Code, Link2, ImagePlus, List, ListOrdered,
  Heading2, Heading3, Quote, Minus, Eye, EyeOff, X, Plus, Loader2,
  Info, ChevronDown, Workflow,
} from 'lucide-react';

const ToolBtn = ({
  onClick, title, children, loading = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    disabled={loading}
    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
  >
    {loading ? <Loader2 size={14} className="animate-spin" /> : children}
  </button>
);

function wrapSelection(
  ta: HTMLTextAreaElement,
  before: string,
  after: string,
  placeholder = 'text'
) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const selected = value.slice(s, e) || placeholder;
  const replacement = `${before}${selected}${after}`;
  const next = value.slice(0, s) + replacement + value.slice(e);
  return { next, cursor: s + before.length + selected.length + after.length };
}

function insertLine(ta: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf('\n', s - 1) + 1;
  const lineEnd = value.indexOf('\n', s);
  const end = lineEnd === -1 ? value.length : lineEnd;
  const line = value.slice(lineStart, end);
  const next = value.slice(0, lineStart) + prefix + line + value.slice(end);
  return { next, cursor: lineStart + prefix.length + line.length };
}

function insertAtCursor(ta: HTMLTextAreaElement, text: string) {
  const { selectionStart: s, value } = ta;
  const next = value.slice(0, s) + text + value.slice(s);
  return { next, cursor: s + text.length };
}

// Full CommonMark + GFM (headings, nested lists, tables, fenced code blocks,
// blockquotes, task lists, etc.), then sanitized before it's ever rendered.
marked.setOptions({ gfm: true, breaks: false });

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note', tip: 'Tip', warning: 'Warning', important: 'Important', caution: 'Caution',
};

// GitHub-style alert blocks:  > [!NOTE] / [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION]
const calloutExtension = {
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
};

marked.use({ extensions: [calloutExtension] });

function mdToHtml(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  // Allow <details>/<summary> (collapsibles) + callout classes through the sanitizer.
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel', 'open'], ADD_TAGS: ['details', 'summary'] });
}

export const WriteArticle = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editUuid = searchParams.get('edit');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  const [editArticle, setEditArticle] = useState<ApiArticle | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(!!editUuid);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [series, setSeries] = useState('');
  const [seriesOrder, setSeriesOrder] = useState('');
  // '' means "no category". The editor opens on that value, so publishing
  // without choosing one is the default path, not an extra step to skip.
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [publishAt, setPublishAt] = useState('');
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inlineUploading, setInlineUploading] = useState(false);
  const [error, setError] = useState('');

  // The taxonomy is a fixed list from the server. If the request fails the
  // select simply has no options beyond "No category", and publishing still
  // works — a category must never be able to block a save.
  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editUuid) return;
    const slug = searchParams.get('slug');
    if (!slug) { setLoadingEdit(false); return; }
    articlesApi.get(slug)
      .then((data) => {
        setEditArticle(data);
      })
      .catch(() => {})
      .finally(() => setLoadingEdit(false));
  }, [editUuid, searchParams]);

  useEffect(() => {
    if (!editArticle) return;
    setTitle(editArticle.title);
    setSubtitle(editArticle.subtitle || '');
    setExcerpt(editArticle.excerpt || '');
    setCoverImage(editArticle.coverImage || '');
    setTags(editArticle.tags);
    setPublished(editArticle.published);
    setContent(editArticle.content);
    setCategory(editArticle.category?.slug || '');
    setSeries(editArticle.series?.title || '');
    setSeriesOrder(editArticle.series?.order ? String(editArticle.series.order) : '');
    // ISO → datetime-local ("YYYY-MM-DDTHH:mm") in local time
    if (editArticle.publishAt) {
      const d = new Date(editArticle.publishAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setPublishAt(local.toISOString().slice(0, 16));
    }
  }, [editArticle]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags((prev) => [...prev, t]);
      setTagInput('');
    }
  };
  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  const applyFormat = useCallback(
    (fn: (ta: HTMLTextAreaElement) => { next: string; cursor: number }) => {
      const ta = taRef.current;
      if (!ta) return;
      const { next, cursor } = fn(ta);
      setContent(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
      });
    },
    []
  );

  const handleInlineUpload = async (file: File) => {
    setInlineUploading(true);
    try {
      const result = await uploadApi.inline(file);
      applyFormat((ta) => insertAtCursor(ta, `\n![image](${result.url})\n`));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setInlineUploading(false);
    }
  };

  const toolbar = [
    { icon: <Heading2 size={15} />, title: 'Heading 2', action: (ta: HTMLTextAreaElement) => insertLine(ta, '## ') },
    { icon: <Heading3 size={15} />, title: 'Heading 3', action: (ta: HTMLTextAreaElement) => insertLine(ta, '### ') },
    { icon: <Bold size={15} />, title: 'Bold', action: (ta: HTMLTextAreaElement) => wrapSelection(ta, '**', '**') },
    { icon: <Italic size={15} />, title: 'Italic', action: (ta: HTMLTextAreaElement) => wrapSelection(ta, '_', '_') },
    { icon: <Code size={15} />, title: 'Inline code', action: (ta: HTMLTextAreaElement) => wrapSelection(ta, '`', '`') },
    {
      icon: <span className="font-mono text-xs">{'</>'}</span>,
      title: 'Code block',
      action: (ta: HTMLTextAreaElement) => wrapSelection(ta, '\n```\n', '\n```\n', 'code here'),
    },
    { icon: <Quote size={15} />, title: 'Blockquote', action: (ta: HTMLTextAreaElement) => insertLine(ta, '> ') },
    { icon: <List size={15} />, title: 'Bullet list', action: (ta: HTMLTextAreaElement) => insertLine(ta, '- ') },
    { icon: <ListOrdered size={15} />, title: 'Numbered list', action: (ta: HTMLTextAreaElement) => insertLine(ta, '1. ') },
    { icon: <Link2 size={15} />, title: 'Link', action: (ta: HTMLTextAreaElement) => wrapSelection(ta, '[', '](url)') },
    { icon: <Minus size={15} />, title: 'Divider', action: (ta: HTMLTextAreaElement) => insertAtCursor(ta, '\n\n---\n\n') },
    { icon: <Info size={15} />, title: 'Callout', action: (ta: HTMLTextAreaElement) => insertAtCursor(ta, '\n\n> [!NOTE]\n> Your note here.\n\n') },
    { icon: <ChevronDown size={15} />, title: 'Collapsible', action: (ta: HTMLTextAreaElement) => insertAtCursor(ta, '\n\n<details>\n<summary>Click to expand</summary>\n\nHidden content here.\n\n</details>\n\n') },
    { icon: <Workflow size={15} />, title: 'Diagram (Mermaid)', action: (ta: HTMLTextAreaElement) => insertAtCursor(ta, '\n\n```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n\n') },
  ];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const autoExcerpt = content.replace(/[#*`>_[\]!<>]/g, '').slice(0, 200).trim();
      const payload: ArticlePayload = {
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        content: editArticle ? content : mdToHtml(content),
        excerpt: excerpt.trim() || autoExcerpt,
        coverImage: editArticle ? (coverImage || null) : (coverImage || undefined),
        published,
        tags,
        // Always sent: null clears the category, which is how an article gets
        // unfiled again. Omitting it would make clearing impossible.
        category: category || null,
        series: series.trim() || null,
        seriesOrder: series.trim() && seriesOrder ? Number(seriesOrder) : null,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      };
      let article: ApiArticle;
      if (editArticle) {
        article = await articlesApi.update(editArticle.uuid, payload);
      } else {
        article = await articlesApi.create(payload);
      }
      clearCache(); // new/edited article — drop cached lists + article so they refetch
      navigate(`/articles/${article.slug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet><title>{editArticle ? 'Edit' : 'Write'} | Scriptory</title></Helmet>

      {loadingEdit ? (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="min-h-screen">
          <div className="glass sticky top-[4.75rem] z-40 rounded-2xl">
            <Container className="flex h-auto min-h-[3rem] flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm font-medium text-muted-foreground">
                {editArticle ? 'Edit article' : 'New article'}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreview((p) => !p)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {preview ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span className="hidden sm:inline">{preview ? 'Edit' : 'Preview'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPublished((p) => !p)}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <div className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${published ? 'bg-brand' : 'bg-muted-foreground/30'}`}>
                    <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${published ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                  <span className="hidden sm:inline">{published ? 'Published' : 'Draft'}</span>
                </button>

                <Button size="sm" onClick={() => handleSubmit()} disabled={saving}>
                  {saving ? 'Saving…' : editArticle ? 'Update' : 'Publish'}
                </Button>
              </div>
            </Container>
          </div>

          <Container className="max-w-3xl py-10">
            {error && (
              <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {preview ? (
              <div>
                {coverImage && (
                  <div className="mb-8 aspect-video overflow-hidden rounded-xl">
                    <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="mb-2 flex flex-wrap gap-2">
                  {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                </div>
                <h1 className="mb-3 text-4xl font-bold leading-tight">{title || 'Untitled'}</h1>
                {subtitle && <p className="mb-8 text-xl text-muted-foreground">{subtitle}</p>}
                <article
                  className="prose prose-lg prose-slate dark:prose-invert prose-a:text-brand marker:text-brand"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(content) }}
                />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted-foreground">
                    Cover image
                  </label>
                  <ImageUpload
                    value={coverImage}
                    onChange={setCoverImage}
                    type="cover"
                    aspectClass="aspect-video"
                    placeholder="Click or drag to upload cover image"
                  />
                </div>

                <textarea
                  placeholder="Article title…"
                  value={title}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTitle(e.target.value)}
                  rows={2}
                  className="w-full resize-none border-0 bg-transparent text-2xl font-bold leading-tight placeholder:text-muted-foreground/40 focus:outline-none sm:text-3xl md:text-4xl"
                />

                <textarea
                  placeholder="Subtitle (optional)…"
                  value={subtitle}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSubtitle(e.target.value)}
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent text-xl text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Excerpt
                  </label>
                  <textarea
                    placeholder="Short description of the article…"
                    value={excerpt}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExcerpt(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                  <p className="mt-1 text-right text-xs text-muted-foreground">{excerpt.length}/500</p>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium">
                        {t}
                        <button type="button" onClick={() => removeTag(t)} className="text-muted-foreground hover:text-foreground">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag…"
                      value={tagInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagInput(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                      className="max-w-[200px]"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addTag}>
                      <Plus size={14} />
                    </Button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="article-category"
                    className="mb-1.5 block text-sm font-medium text-muted-foreground"
                  >
                    Category <span className="font-normal">(optional)</span>
                  </label>
                  <select
                    id="article-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {/* Listed first and selected by default — uncategorised is a
                        valid, unremarkable end state, not a missing value. */}
                    <option value="">No category</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Where this sits in the learning path. Leave as "No category" to publish
                    without one — you can file it later without touching the article.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Series <span className="font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Series name, e.g. Distributed Systems"
                      value={series}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeries(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      placeholder="Part #"
                      value={seriesOrder}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeriesOrder(e.target.value)}
                      className="sm:max-w-[110px]"
                      disabled={!series.trim()}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Group related posts. Same series name = same collection; the part number orders them.
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Schedule publish <span className="font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="datetime-local"
                      value={publishAt}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPublishAt(e.target.value)}
                      className="max-w-[240px]"
                    />
                    {publishAt && (
                      <button type="button" onClick={() => setPublishAt('')} className="text-xs text-muted-foreground hover:text-foreground">
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Set a future time to auto-publish later — the post stays a draft until then.
                  </p>
                </div>

                <hr className="border-border" />

                <div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/30 p-1.5">
                  {toolbar.map((item) => (
                    <ToolBtn key={item.title} title={item.title} onClick={() => applyFormat(item.action)}>
                      {item.icon}
                    </ToolBtn>
                  ))}
                  <div className="mx-1 h-5 w-px bg-border" />
                  <ToolBtn
                    title="Upload image into article"
                    onClick={() => inlineInputRef.current?.click()}
                    loading={inlineUploading}
                  >
                    <ImagePlus size={15} />
                  </ToolBtn>
                  <input
                    ref={inlineInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0];
                      if (file) handleInlineUpload(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                <textarea
                  ref={taRef}
                  placeholder="Tell your story… (supports Markdown)"
                  value={content}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
                  rows={28}
                  className="w-full resize-none border-0 bg-transparent font-mono text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none"
                />
              </form>
            )}
          </Container>
        </div>
      )}
    </>
  );
};

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { articlesApi, uploadApi, type ArticlePayload, type ApiArticle } from '../lib/api';
import { Container } from '../components/ui/Container';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { ImageUpload } from '../components/ui/ImageUpload';
import {
  Bold, Italic, Code, Link2, ImagePlus, List, ListOrdered,
  Heading2, Heading3, Quote, Minus, Eye, EyeOff, X, Plus, Loader2,
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

function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^---$/gm, '<hr />')
    .replace(/\n\n/g, '</p><p>');
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
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [inlineUploading, setInlineUploading] = useState(false);
  const [error, setError] = useState('');

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
      };
      let article: ApiArticle;
      if (editArticle) {
        article = await articlesApi.update(editArticle.uuid, payload);
      } else {
        article = await articlesApi.create(payload);
      }
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
        <div className="min-h-screen bg-background">
          <div className="sticky top-16 z-40 border-b bg-background/95 [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]">
            <Container className="flex h-auto min-h-[3rem] flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm text-muted-foreground">
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
                  <div className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${published ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
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
                  className="prose prose-lg prose-slate dark:prose-invert"
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
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
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

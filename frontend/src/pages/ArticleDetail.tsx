import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ArticleCard } from '../components/ui/ArticleCard';
import { SmartImage } from '../components/ui/SmartImage';
import { ArticleDetailSkeleton } from '../components/ui/Skeleton';
import { articlesApi, commentsApi, likesApi, bookmarksApi, type ApiArticle, type ApiComment } from '../lib/api';
import { getCache, setCache, clearCache } from '../lib/cache';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Clock, Calendar, Eye, Pencil, Trash2, Send, X, Heart, Share2, Link2, Twitter, Linkedin, Check, List, ArrowUp, Layers, ChevronLeft, ChevronRight, Bookmark, BookOpen } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

interface TocItem { id: string; text: string; level: number }

// The API origin (without the /api suffix) — used to build the OG image URL.
const OG_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const slugifyHeading = (text: string) =>
  text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'section';

const ReadingProgress = ({ readingTime }: { readingTime?: number }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const total = readingTime ?? 0;
  const minsLeft = total > 0 ? Math.ceil(total * (1 - progress / 100)) : 0;
  const showPill = progress > 3 && progress < 97;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-transparent">
        <div
          className="h-full bg-brand transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>
      {showPill && (
        <div className="glass fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-lg shadow-black/10">
          {Math.round(progress)}% read
          {total > 0 && <> · <span className="text-foreground">{minsLeft} min left</span></>}
        </div>
      )}
    </>
  );
};

const ShareButtons = ({ title, slug }: { title: string; slug: string }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/articles/${slug}`;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Share2 className="h-3.5 w-3.5" /> Share
      </span>
      <button
        onClick={copyLink}
        title="Copy link"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Copy link"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Link2 className="h-3.5 w-3.5" />}
      </button>
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on X / Twitter"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Share on Twitter"
      >
        <Twitter className="h-3.5 w-3.5" />
      </a>
      <a
        href={linkedinUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share on LinkedIn"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Share on LinkedIn"
      >
        <Linkedin className="h-3.5 w-3.5" />
      </a>
    </div>
  );
};

const TableOfContents = ({ items, activeId, visible }: { items: TocItem[]; activeId: string; visible: boolean }) => {
  if (items.length < 3) return null;
  return (
    <nav
      aria-label="Table of contents"
      className={`fixed left-6 top-28 hidden max-h-[calc(100vh-12rem)] w-56 overflow-y-auto transition-opacity duration-300 xl:block 2xl:left-[max(1.5rem,calc(50vw-45rem))] ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand">
        <List className="h-3.5 w-3.5" /> On this page
      </p>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`-ml-px block border-l-2 py-1 text-sm transition-colors ${
                item.level === 3 ? 'pl-7' : item.level === 2 ? 'pl-4' : 'pl-3'
              } ${
                activeId === item.id
                  ? 'border-brand font-medium text-brand'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

const BackToTop = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="glass fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full shadow-lg shadow-black/10 transition-all hover:text-brand active:scale-95"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
};

const SeriesBox = ({ series, currentSlug }: { series: NonNullable<ApiArticle['series']>; currentSlug: string }) => {
  const idx = series.articles.findIndex((a) => a.slug === currentSlug);
  return (
    <div className="mb-8 rounded-2xl border border-brand/30 bg-brand-muted p-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Layers className="h-4 w-4 text-brand" />
        <span className="text-xs font-bold uppercase tracking-widest text-brand">Series</span>
        <span className="text-sm font-semibold">{series.title}</span>
        {idx >= 0 && (
          <span className="text-xs text-muted-foreground">· Part {idx + 1} of {series.articles.length}</span>
        )}
      </div>
      <ol className="space-y-1.5">
        {series.articles.map((a, i) => {
          const current = a.slug === currentSlug;
          return (
            <li key={a.slug} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  current ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {i + 1}
              </span>
              {current ? (
                <span className="font-medium">{a.title}</span>
              ) : (
                <Link to={`/articles/${a.slug}`} className="text-muted-foreground transition-colors hover:text-brand">
                  {a.title}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const SeriesNav = ({ series, currentSlug }: { series: NonNullable<ApiArticle['series']>; currentSlug: string }) => {
  const idx = series.articles.findIndex((a) => a.slug === currentSlug);
  if (idx < 0) return null;
  const prev = series.articles[idx - 1];
  const next = series.articles[idx + 1];
  if (!prev && !next) return null;
  return (
    <div className="mt-10 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link to={`/articles/${prev.slug}`} className="card-premium group flex items-center gap-3 rounded-xl p-4">
          <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-brand" />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Previous in series</span>
            <span className="block truncate font-medium group-hover:text-brand">{prev.title}</span>
          </span>
        </Link>
      ) : <span />}
      {next && (
        <Link to={`/articles/${next.slug}`} className="card-premium group flex items-center justify-end gap-3 rounded-xl p-4 text-right sm:col-start-2">
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">Next in series</span>
            <span className="block truncate font-medium group-hover:text-brand">{next.title}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-brand" />
        </Link>
      )}
    </div>
  );
};

export const ArticleDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { theme } = useTheme();
  const [article, setArticle] = useState<ApiArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const viewIncrementedRef = useRef(false);

  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [related, setRelated] = useState<ApiArticle[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeHeading, setActiveHeading] = useState<string>('');
  const [showToc, setShowToc] = useState(false);

  // Only show the floating TOC while the article body is in view (never over
  // the footer/comments).
  useEffect(() => {
    const onScroll = () => {
      const el = articleRef.current;
      if (!el) { setShowToc(false); return; }
      const r = el.getBoundingClientRect();
      setShowToc(r.top < window.innerHeight * 0.5 && r.bottom > 160);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [article]);

  // Reader preferences (persisted): font size + sepia theme.
  const [readerScale, setReaderScale] = useState<'sm' | 'md' | 'lg'>(
    () => (typeof localStorage !== 'undefined' && (localStorage.getItem('reader:scale') as 'sm' | 'md' | 'lg')) || 'md'
  );
  const [readerSepia, setReaderSepia] = useState<boolean>(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('reader:sepia') === '1'
  );
  useEffect(() => { try { localStorage.setItem('reader:scale', readerScale); } catch {} }, [readerScale]);
  useEffect(() => { try { localStorage.setItem('reader:sepia', readerSepia ? '1' : '0'); } catch {} }, [readerSepia]);
  const readerFontSize = { sm: '1rem', md: '1.125rem', lg: '1.3rem' }[readerScale];

  useEffect(() => {
    if (!slug) return;
    viewIncrementedRef.current = false;
    setNotFound(false);
    setRelated([]);

    // seed instantly from cache (skip skeleton) then revalidate in the background
    const cachedArticle = getCache<ApiArticle>(`article:${slug}`);
    if (cachedArticle) {
      setArticle(cachedArticle);
      setComments(cachedArticle.comments ?? []);
      setLoading(false);
    } else {
      setLoading(true);
      setArticle(null);
      setComments([]);
    }

    let cancelled = false;
    articlesApi.get(slug)
      .then((data) => {
        if (cancelled) return;
        setArticle(data);
        // comments ship with the article-detail payload — no separate request needed
        setComments(data.comments ?? []);
        setCache(`article:${slug}`, data);
        if (!viewIncrementedRef.current) {
          viewIncrementedRef.current = true;
          articlesApi.incrementViewBySlug(slug).catch(() => {});
        }
        likesApi.status(slug)
          .then((s) => { if (!cancelled) { setLiked(s.liked); setLikeCount(s.likeCount); } })
          .catch(() => {});
        if (user) {
          bookmarksApi.status(slug)
            .then((b) => { if (!cancelled) setBookmarked(b.bookmarked); })
            .catch(() => {});
        }
        // Related by content-embedding similarity (falls back to shared tags server-side).
        articlesApi.related(slug)
          .then((rel) => { if (!cancelled) setRelated(rel); })
          .catch(() => {});
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const container = articleRef.current;
    if (!article) { setToc([]); return; }
    if (!container) return;

    // Build the table of contents from headings + give each a stable id.
    const headingEls = container.querySelectorAll<HTMLHeadingElement>('h1, h2, h3');
    const usedIds = new Set<string>();
    const items: TocItem[] = [];
    headingEls.forEach((h) => {
      const text = h.textContent?.trim() || '';
      if (!text) return;
      let id = slugifyHeading(text);
      let n = 1;
      while (usedIds.has(id)) id = `${slugifyHeading(text)}-${n++}`;
      usedIds.add(id);
      h.id = id;
      h.style.scrollMarginTop = '6rem';
      const level = h.tagName === 'H1' ? 1 : h.tagName === 'H2' ? 2 : 3;
      items.push({ id, text, level });
    });
    setToc(items);

    // Render Mermaid diagrams (```mermaid blocks) — lazy-loaded, only if present.
    if (container.querySelector('pre > code.language-mermaid')) {
      import('../lib/mermaid')
        .then(({ renderMermaid }) => renderMermaid(container, theme === 'dark'))
        .catch(() => { /* mermaid unavailable — source stays visible */ });
    }

    // Syntax-highlight every non-diagram code block (highlighter is lazy-loaded).
    import('../lib/highlighter').then(({ default: hljs }) => {
      container.querySelectorAll<HTMLElement>('pre code:not(.language-mermaid)').forEach((code) => {
        if (!code.dataset.highlighted) {
          try { hljs.highlightElement(code); } catch { /* unknown language — leave plain */ }
        }
      });
    }).catch(() => { /* highlighter unavailable — code stays readable */ });

    const preElements = container.querySelectorAll<HTMLPreElement>('pre');
    const cleanups: (() => void)[] = [];

    preElements.forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
      if (pre.querySelector('code.language-mermaid')) return; // diagram, not code
      const code = pre.querySelector('code');
      const codeText = code?.innerText ?? pre.innerText;
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      wrapper.style.cssText = 'position:relative';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'Copy code');
      btn.style.cssText = [
        'position:absolute', 'top:0.5rem', 'right:0.5rem',
        'display:inline-flex', 'align-items:center', 'gap:0.25rem',
        'padding:0.25rem 0.5rem', 'font-size:0.75rem',
        'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
        'color:#8b949e', 'background:#161b22', 'border:1px solid #30363d',
        'border-radius:0.375rem', 'cursor:pointer',
        'transition:color 0.2s,border-color 0.2s', 'z-index:10',
      ].join(';');
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>`;
      let resetTimer: ReturnType<typeof setTimeout> | null = null;
      const handleClick = async () => {
        try { await navigator.clipboard.writeText(codeText); } catch {
          const ta = document.createElement('textarea');
          ta.value = codeText; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); document.body.removeChild(ta);
        }
        btn.setAttribute('aria-label', 'Copied');
        btn.style.color = '#3fb950'; btn.style.borderColor = '#3fb950';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Copied</span>`;
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          btn.setAttribute('aria-label', 'Copy code');
          btn.style.color = '#8b949e'; btn.style.borderColor = '#30363d';
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>`;
        }, 2000);
      };
      btn.addEventListener('click', handleClick);
      wrapper.appendChild(btn);
      cleanups.push(() => {
        if (resetTimer) clearTimeout(resetTimer);
        btn.removeEventListener('click', handleClick);
        wrapper.parentNode?.insertBefore(pre, wrapper);
        wrapper.remove();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [article]);

  // Scroll-spy: highlight the TOC entry for the heading currently in view.
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveHeading(visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    toc.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc]);

  const handleDelete = async () => {
    if (!article) return;
    setDeleting(true);
    try {
      await articlesApi.delete(article.uuid);
      clearCache(); // article gone — drop cached article + stale lists
      navigate('/articles');
    } catch {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  const handleLike = async () => {
    if (!user || !slug) return;
    setLikeLoading(true);
    try {
      const result = await likesApi.toggle(slug);
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {}
    finally { setLikeLoading(false); }
  };

  const handleBookmark = async () => {
    if (!user || !slug) return;
    setBookmarkLoading(true);
    try {
      const result = await bookmarksApi.toggle(slug);
      setBookmarked(result.bookmarked);
    } catch {}
    finally { setBookmarkLoading(false); }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !slug) return;
    setCommentLoading(true);
    setCommentError('');
    try {
      const newComment = await commentsApi.create(slug, commentText.trim());
      setComments((prev) => {
        const next = [newComment, ...prev];
        const cached = getCache<ApiArticle>(`article:${slug}`);
        if (cached) setCache(`article:${slug}`, { ...cached, comments: next });
        return next;
      });
      setCommentText('');
    } catch (err: unknown) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleCommentDelete = async (commentUuid: string) => {
    if (!slug) return;
    try {
      await commentsApi.delete(slug, commentUuid);
      setComments((prev) => {
        const next = prev.filter((c) => c.uuid !== commentUuid);
        const cached = getCache<ApiArticle>(`article:${slug}`);
        if (cached) setCache(`article:${slug}`, { ...cached, comments: next });
        return next;
      });
    } catch {}
  };

  if (loading) {
    return (
      <>
        <ReadingProgress />
        <Section className="pb-8 pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <ArticleDetailSkeleton />
          </Container>
        </Section>
      </>
    );
  }

  if (notFound || !article) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h1 className="mb-4 text-4xl font-bold">Article Not Found</h1>
        <p className="mb-8 text-muted-foreground">The article you are looking for does not exist.</p>
        <Link to="/articles"><Button>Back to Articles</Button></Link>
      </Container>
    );
  }

  const authorName = article.author.profile?.name || 'Author';
  const authorAvatar = article.author.profile?.avatarUrl || '/anuj.png';

  return (
    <>
      <Helmet>
        <title>{article.title} | Scriptory</title>
        <meta name="description" content={article.excerpt} />
        <link rel="canonical" href={`${window.location.origin}/articles/${article.slug}`} />
        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={article.title} />
        <meta property="og:description" content={article.excerpt} />
        <meta property="og:url" content={`${window.location.origin}/articles/${article.slug}`} />
        <meta property="og:image" content={`${OG_ORIGIN}/og/${article.slug}.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="article:published_time" content={article.createdAt} />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={article.title} />
        <meta name="twitter:description" content={article.excerpt} />
        <meta name="twitter:image" content={`${OG_ORIGIN}/og/${article.slug}.png`} />
        {/* JSON-LD structured data for rich results */}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: article.title,
            description: article.excerpt,
            image: article.coverImage || undefined,
            datePublished: article.createdAt,
            dateModified: article.updatedAt,
            author: { '@type': 'Person', name: article.author.profile?.name || 'Anuj Chauhan' },
            keywords: article.tags.join(', '),
            url: `${window.location.origin}/articles/${article.slug}`,
          })}
        </script>
      </Helmet>

      <ReadingProgress readingTime={article.readingTime} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <Section className="pb-8 pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
              <Link to="/articles" className="group inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-brand">
                <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                Back to Articles
              </Link>

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/write?edit=${article.uuid}&slug=${article.slug}`)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {deleteConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Sure?</span>
                      <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleting} className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                        {deleting ? 'Deleting…' : 'Yes, delete'}
                      </Button>
                      <button onClick={() => setDeleteConfirm(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(true)} className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>

            <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {article.title}
            </h1>

            {article.subtitle && (
              <p className="mb-8 text-lg text-muted-foreground sm:text-xl md:text-2xl">
                {article.subtitle}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-8 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center">
                  <img src={authorAvatar} alt={authorName} className="mr-2 h-6 w-6 rounded-full object-cover" />
                  <span className="font-medium text-foreground">{authorName}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>
                    {new Date(article.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  <span>{article.readingTime ?? 1} min read</span>
                </div>
                <div className="flex items-center">
                  <Eye className="mr-2 h-4 w-4" />
                  <span>{article.viewCount}</span>
                </div>
                <button
                  onClick={handleLike}
                  disabled={!user || likeLoading}
                  title={user ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
                  className={`flex items-center gap-1.5 transition-colors disabled:opacity-50 ${liked ? 'text-red-500' : 'hover:text-red-500'}`}
                >
                  <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                  <span>{likeCount}</span>
                </button>
                <button
                  onClick={handleBookmark}
                  disabled={!user || bookmarkLoading}
                  title={user ? (bookmarked ? 'Remove bookmark' : 'Save for later') : 'Sign in to save'}
                  className={`flex items-center gap-1.5 transition-colors disabled:opacity-50 ${bookmarked ? 'text-brand' : 'hover:text-brand'}`}
                >
                  <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-current' : ''}`} />
                  <span className="hidden sm:inline">{bookmarked ? 'Saved' : 'Save'}</span>
                </button>
              </div>
            </div>
          </Container>
        </Section>

        {article.coverImage && (
          <div className="w-full bg-muted/20">
            <Container className="max-w-5xl px-0 sm:px-6 lg:px-8">
              <div className="relative aspect-video w-full overflow-hidden sm:rounded-xl">
                <SmartImage src={article.coverImage} alt={article.title} sizes="(max-width: 1024px) 100vw, 1024px" />
              </div>
            </Container>
          </div>
        )}

        <Section className="relative pt-12 md:pt-16">
          <TableOfContents items={toc} activeId={activeHeading} visible={showToc} />
          <Container className="max-w-3xl">
            <div className="mb-6 flex items-center justify-end gap-2">
              <div className="flex items-center rounded-full border border-border bg-background/40 p-0.5">
                {(['sm', 'md', 'lg'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setReaderScale(s)}
                    aria-label={`Font size ${s}`}
                    className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                      readerScale === s ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
                    } ${s === 'sm' ? 'text-xs' : s === 'md' ? 'text-sm' : 'text-base'}`}
                  >
                    A
                  </button>
                ))}
              </div>
              <button
                onClick={() => setReaderSepia((v) => !v)}
                title="Sepia reading mode"
                className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                  readerSepia ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'border-border bg-background/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" /> Sepia
              </button>
            </div>

            {article.series && <SeriesBox series={article.series} currentSlug={article.slug} />}
            <article
              ref={articleRef}
              style={{ fontSize: readerFontSize }}
              className={`prose prose-lg prose-slate dark:prose-invert max-w-none prose-a:text-brand prose-a:no-underline hover:prose-a:underline marker:text-brand [&_pre]:overflow-x-auto [&_table]:overflow-x-auto [&_table]:block ${readerSepia ? 'reader-sepia' : ''}`}
              dangerouslySetInnerHTML={{ __html: article.content }}
            />

            {article.series && <SeriesNav series={article.series} currentSlug={article.slug} />}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-8">
              <div className="flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
              <ShareButtons title={article.title} slug={article.slug} />
            </div>
          </Container>
        </Section>

        {related.length > 0 && (
          <Section className="bg-muted/30">
            <Container className="max-w-5xl">
              <h2 className="mb-6 text-xl font-semibold">Related Articles</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((a, i) => (
                  <ArticleCard key={a.uuid} article={a} index={i} />
                ))}
              </div>
            </Container>
          </Section>
        )}

        <Section className="pb-16 pt-12">
          <Container className="max-w-3xl">
            <div className="border-t border-border pt-10">
              <h2 className="mb-6 text-xl font-semibold">
                Comments {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
              </h2>

              {user ? (
                <form onSubmit={handleCommentSubmit} className="mb-8">
                  <div className="flex items-start gap-3">
                    {user.profile?.avatarUrl ? (
                      <img
                        src={user.profile.avatarUrl}
                        alt={user.profile?.name || user.email}
                        className="mt-1 h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {(user.profile?.name || user.email).split(/[\s@]/)[0].slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Write a comment…"
                        rows={3}
                        className="w-full resize-none rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand/50"
                      />
                      {commentError && (
                        <p className="mt-1 text-xs text-destructive">{commentError}</p>
                      )}
                      <div className="mt-2 flex justify-end">
                        <Button type="submit" size="sm" disabled={commentLoading || !commentText.trim()}>
                          {commentLoading ? 'Posting…' : (
                            <>
                              <Send className="mr-1.5 h-3.5 w-3.5" />
                              Post
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              ) : (
                <p className="mb-8 text-sm text-muted-foreground">
                  <Link to="/login" className="font-medium text-brand hover:underline">Sign in</Link> to leave a comment.
                </p>
              )}

              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
              ) : (
                <div className="space-y-6">
                  {comments.map((comment) => {
                    const name = comment.user.profile?.name || 'User';
                    const canDelete = isAdmin || user?.uuid === comment.user.uuid;
                    return (
                      <div key={comment.uuid} className="flex items-start gap-3">
                        {comment.user.profile?.avatarUrl ? (
                          <img src={comment.user.profile.avatarUrl} alt={name} className="mt-0.5 h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {name.split(/[\s@]/)[0].slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{name}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.createdAt).toLocaleDateString('en-US', {
                                  year: 'numeric', month: 'short', day: 'numeric',
                                })}
                              </span>
                            </div>
                            {canDelete && (
                              <button
                                onClick={() => handleCommentDelete(comment.uuid)}
                                className="text-muted-foreground/50 transition-colors hover:text-destructive"
                                aria-label="Delete comment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-foreground/80">{comment.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Container>
        </Section>
      </motion.div>

      <BackToTop />
    </>
  );
};

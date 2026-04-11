import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ArticleCard } from '../components/ui/ArticleCard';
import { ArticleDetailSkeleton } from '../components/ui/Skeleton';
import { articlesApi, commentsApi, likesApi, type ApiArticle, type ApiComment } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Clock, Calendar, Eye, Pencil, Trash2, Send, X, Heart, Share2, Link2, Twitter, Linkedin, Check } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

const ReadingProgress = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0);
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-transparent">
      <div
        className="h-full bg-primary transition-[width] duration-100"
        style={{ width: `${progress}%` }}
      />
    </div>
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

export const ArticleDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
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

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [related, setRelated] = useState<ApiArticle[]>([]);

  useEffect(() => {
    if (!slug) return;
    viewIncrementedRef.current = false;
    setLoading(true);
    setNotFound(false);
    setArticle(null);
    setComments([]);
    setRelated([]);

    let cancelled = false;
    articlesApi.get(slug)
      .then((data) => {
        if (cancelled) return;
        setArticle(data);
        if (!viewIncrementedRef.current) {
          viewIncrementedRef.current = true;
          articlesApi.incrementViewBySlug(slug).catch(() => {});
        }
        commentsApi.list(slug)
          .then((c) => { if (!cancelled) setComments(c); })
          .catch(() => {});
        likesApi.status(slug)
          .then((s) => { if (!cancelled) { setLiked(s.liked); setLikeCount(s.likeCount); } })
          .catch(() => {});
        if (data.tags.length > 0) {
          articlesApi.list({ tag: data.tags[0], limit: 4 })
            .then((res) => {
              if (!cancelled) {
                setRelated(res.articles.filter((a) => a.slug !== slug).slice(0, 3));
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => { if (!cancelled) setNotFound(true); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    const container = articleRef.current;
    if (!container || !article) return;

    const preElements = container.querySelectorAll<HTMLPreElement>('pre');
    const cleanups: (() => void)[] = [];

    preElements.forEach((pre) => {
      if (pre.parentElement?.classList.contains('code-block-wrapper')) return;
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

  const handleDelete = async () => {
    if (!article) return;
    setDeleting(true);
    try {
      await articlesApi.delete(article.uuid);
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

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !slug) return;
    setCommentLoading(true);
    setCommentError('');
    try {
      const newComment = await commentsApi.create(slug, commentText.trim());
      setComments((prev) => [newComment, ...prev]);
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
      setComments((prev) => prev.filter((c) => c.uuid !== commentUuid));
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
      </Helmet>

      <ReadingProgress />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <Section className="pb-8 pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
              <Link to="/articles" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="mr-2 h-4 w-4" />
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
              </div>
            </div>
          </Container>
        </Section>

        {article.coverImage && (
          <div className="w-full bg-muted/20">
            <Container className="max-w-5xl px-0 sm:px-6 lg:px-8">
              <div className="relative aspect-video w-full overflow-hidden sm:rounded-xl">
                <img src={article.coverImage} alt={article.title} className="h-full w-full object-cover" />
              </div>
            </Container>
          </div>
        )}

        <Section className="pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <article
              ref={articleRef}
              className="prose prose-lg prose-slate dark:prose-invert max-w-none [&_pre]:overflow-x-auto [&_table]:overflow-x-auto [&_table]:block"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />

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
                        className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
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
                  <Link to="/login" className="text-primary hover:underline">Sign in</Link> to leave a comment.
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
    </>
  );
};

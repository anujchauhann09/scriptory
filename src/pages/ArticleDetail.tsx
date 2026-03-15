import React, { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Clock, Calendar, User } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export const ArticleDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);
  const articleRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    const container = articleRef.current;
    if (!container) return;

    const preElements = container.querySelectorAll<HTMLPreElement>('pre');
    const cleanups: (() => void)[] = [];

    preElements.forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;

      const code = pre.querySelector('code');
      const codeText = code?.innerText ?? pre.innerText;

      pre.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.setAttribute('aria-label', 'Copy code');
      btn.style.cssText = [
        'position:absolute',
        'top:0.5rem',
        'right:0.5rem',
        'display:inline-flex',
        'align-items:center',
        'gap:0.25rem',
        'padding:0.25rem 0.5rem',
        'font-size:0.75rem',
        'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
        'color:#8b949e',
        'background:transparent',
        'border:1px solid #30363d',
        'border-radius:0.375rem',
        'cursor:pointer',
        'transition:color 0.2s,border-color 0.2s',
        'z-index:10',
      ].join(';');
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>`;

      let resetTimer: ReturnType<typeof setTimeout> | null = null;

      const handleClick = async () => {
        try {
          await navigator.clipboard.writeText(codeText);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = codeText;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }

        btn.setAttribute('aria-label', 'Copied');
        btn.style.color = '#3fb950';
        btn.style.borderColor = '#3fb950';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Copied</span>`;

        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          btn.setAttribute('aria-label', 'Copy code');
          btn.style.color = '#8b949e';
          btn.style.borderColor = '#30363d';
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Copy</span>`;
        }, 2000);
      };

      btn.addEventListener('click', handleClick);
      pre.appendChild(btn);

      cleanups.push(() => {
        if (resetTimer) clearTimeout(resetTimer);
        btn.removeEventListener('click', handleClick);
        btn.remove();
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, [article]);

  if (!article) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h1 className="mb-4 text-4xl font-bold">Article Not Found</h1>
        <p className="mb-8 text-muted-foreground">The article you are looking for does not exist.</p>
        <Link to="/articles">
          <Button>Back to Articles</Button>
        </Link>
      </Container>
    );
  }

  return (
    <>
      <Helmet>
        <title>{article.title} | Scriptory</title>
        <meta name="description" content={article.excerpt} />
      </Helmet>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <Section className="pb-8 pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <Link to="/articles" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Articles
            </Link>
            
            <div className="mb-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
            
            <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {article.title}
            </h1>
            
            <p className="mb-8 text-xl text-muted-foreground md:text-2xl">
              {article.subtitle}
            </p>
            
            <div className="flex items-center justify-between border-b border-border pb-8 text-sm text-muted-foreground">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span className="font-medium text-foreground">{article.author}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>{article.date}</span>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4" />
                <span>{calculateReadingTime(article.content)}</span>
              </div>
            </div>
          </Container>
        </Section>

        <div className="w-full bg-muted/20">
          <Container className="max-w-5xl px-0 sm:px-6 lg:px-8">
            <div className="relative aspect-video w-full overflow-hidden sm:rounded-xl">
              <img
                src={article.coverImage}
                alt={article.title}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </Container>
        </div>

        <Section className="pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <article 
              ref={articleRef}
              className="prose prose-lg prose-slate dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          </Container>
        </Section>
      </motion.div>
    </>
  );
};

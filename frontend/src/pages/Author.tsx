import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { ArticleCard } from '../components/ui/ArticleCard';
import { ArticleCardSkeleton } from '../components/ui/Skeleton';
import { articlesApi, type ApiArticle } from '../lib/api';
import { Github, Twitter, Linkedin } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

const SOCIAL = {
  github: 'https://github.com/anujchauhann09',
  twitter: 'https://x.com/anujchauhannn',
  linkedin: 'https://linkedin.com/in/anujchauhann',
};

export const Author = () => {
  const shouldReduceMotion = useReducedMotion();
  const [articles, setArticles] = useState<ApiArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    articlesApi.list({ limit: 24 })
      .then((res) => { if (!cancelled) setArticles(res.articles); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <>
      <Helmet>
        <title>Anuj Chauhan | Scriptory</title>
        <meta name="description" content="Backend-focused software developer writing about system design, APIs, and distributed systems." />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: 'Anuj Chauhan',
            url: `${origin}/author`,
            jobTitle: 'Backend Engineer',
            description: 'Backend-focused software developer writing about system design, APIs, and distributed systems.',
            sameAs: [SOCIAL.github, SOCIAL.twitter, SOCIAL.linkedin],
          })}
        </script>
      </Helmet>

      <Section>
        <Container className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
            className="glass flex flex-col items-center gap-5 rounded-3xl p-8 text-center shadow-lg shadow-black/5 sm:flex-row sm:items-start sm:text-left"
          >
            <img
              src="/anuj.png"
              alt="Anuj Chauhan"
              className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-brand/40"
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-brand">The author</span>
              <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Anuj Chauhan</h1>
              <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
                Backend-focused software developer who enjoys designing scalable systems and building reliable,
                production-grade APIs. I write about system design, distributed architecture, and the messy
                realities of shipping backend software.
              </p>
              <div className="mt-4 flex justify-center gap-3 sm:justify-start">
                {[
                  { href: SOCIAL.github, icon: Github, label: 'GitHub' },
                  { href: SOCIAL.twitter, icon: Twitter, label: 'Twitter' },
                  { href: SOCIAL.linkedin, icon: Linkedin, label: 'LinkedIn' },
                ].map(({ href, icon: Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 text-muted-foreground transition-all hover:border-brand/40 hover:text-brand"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>
          </motion.div>

          <h2 className="mb-6 mt-12 font-display text-2xl font-bold tracking-tight">
            Articles {articles.length > 0 && <span className="text-muted-foreground">({articles.length})</span>}
          </h2>
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <ArticleCardSkeleton key={i} />)}
            </div>
          ) : articles.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a, i) => <ArticleCard key={a.uuid} article={a} index={i} />)}
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No articles yet.</p>
          )}
        </Container>
      </Section>
    </>
  );
};

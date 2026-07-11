import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { ArticleCard } from '../components/ui/ArticleCard';
import { ArticleCardSkeleton } from '../components/ui/Skeleton';
import { Badge } from '../components/ui/Badge';
import { articlesApi, type ApiArticle } from '../lib/api';
import { getCache, setCache } from '../lib/cache';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';

const HOME_CACHE_KEY = 'home:articles';

export const Home = () => {
  const cached = getCache<ApiArticle[]>(HOME_CACHE_KEY);
  const [articles, setArticles] = useState<ApiArticle[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    // revalidate in the background; cached data (if any) is already shown
    articlesApi.list({ limit: 4 })
      .then((res) => {
        if (cancelled) return;
        setArticles(res.articles);
        setCache(HOME_CACHE_KEY, res.articles);
      })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const featuredArticle = articles[0];
  const recentArticles = articles.slice(0, 3);

  return (
    <>
      <Section className="relative overflow-hidden py-24 md:py-36">
        <Container className="flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
            className="glass mb-8 inline-flex items-center gap-2.5 rounded-full px-4 py-1.5"
          >
            <span className="brand-dot" />
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              Backend engineering, from the trenches
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.05 }}
            className="mb-6 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl md:text-7xl"
          >
            <span className="text-gradient">My Bugs, My Lessons,</span>
            <br />
            <span className="text-brand">Your Advantage.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.15 }}
            className="mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            Real-world backend engineering — system design, APIs, distributed systems, and production war stories. Learned the hard way so you don't have to.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.25 }}
            className="flex flex-col items-center gap-4 sm:flex-row"
          >
            <Link to="/articles">
              <button className="shiny-cta inline-flex h-12 items-center gap-2 px-8 text-base font-semibold">
                Read Articles
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
            <Link to="/about">
              <Button size="lg" variant="outline">About the author</Button>
            </Link>
          </motion.div>
        </Container>
      </Section>

      {!loading && featuredArticle && (
        <Section className="pt-0">
          <Container>
            <div className="mb-8 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" />
              <h2 className="text-xs font-bold uppercase tracking-widest text-brand">Featured Story</h2>
            </div>
            <div className="group card-premium relative grid overflow-hidden rounded-3xl md:grid-cols-2">
              <div className="aspect-video overflow-hidden md:aspect-auto">
                <img
                  src={featuredArticle.coverImage || '/placeholder.png'}
                  alt={featuredArticle.title}
                  className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
              </div>
              <div className="flex flex-col justify-center p-7 md:p-10">
                {featuredArticle.tags.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {featuredArticle.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {new Date(featuredArticle.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'short', day: 'numeric',
                    })}
                  </span>
                  <span className="text-brand">•</span>
                  <span>{featuredArticle.readingTime ?? 1} min read</span>
                </div>
                <Link to={`/articles/${featuredArticle.slug}`}>
                  <h3 className="mb-3 font-display text-2xl font-bold leading-tight tracking-tight transition-colors group-hover:text-brand md:text-4xl">
                    {featuredArticle.title}
                  </h3>
                </Link>
                <p className="mb-6 leading-relaxed text-muted-foreground">{featuredArticle.excerpt}</p>
                <div className="mt-auto flex items-center gap-3">
                  <img
                    src={featuredArticle.author.profile?.avatarUrl || '/anuj.png'}
                    alt={featuredArticle.author.profile?.name || featuredArticle.author.email}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-border"
                  />
                  <span className="text-sm font-medium">
                    {featuredArticle.author.profile?.name || featuredArticle.author.email}
                  </span>
                </div>
              </div>
            </div>
          </Container>
        </Section>
      )}

      <Section>
        <Container>
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Recent Articles</h2>
              <p className="mt-1 text-sm text-muted-foreground">Fresh from the editor.</p>
            </div>
            <Link to="/articles">
              <Button variant="ghost" className="text-brand hover:text-brand">
                View All <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {loading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => <ArticleCardSkeleton key={i} />)}
            </div>
          ) : recentArticles.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {recentArticles.map((article, index) => (
                <ArticleCard key={article.uuid} article={article} index={index} />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-muted-foreground">No articles found.</p>
          )}
        </Container>
      </Section>

      <Section>
        <Container>
          <div className="glass relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-brand/20 blur-[100px]" />
            <div className="relative">
              <h2 className="mb-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Let's talk <span className="text-brand">backend.</span>
              </h2>
              <p className="mx-auto mb-8 max-w-md text-muted-foreground">
                Have a question, want to discuss backend architecture, or just want to say hi? Drop a message.
              </p>
              <Link to="/contact">
                <button className="shiny-cta inline-flex h-12 items-center gap-2 px-8 text-base font-semibold">
                  Get in Touch
                  <ArrowRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
};

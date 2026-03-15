import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { ArticleCard } from '../components/ui/ArticleCard';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { motion, useReducedMotion } from 'motion/react';

export const Home = () => {
  const featuredArticle = articles[0];
  const recentArticles = articles.slice(1, 4);
  const shouldReduceMotion = useReducedMotion();

  return (
    <>
      <Section className="bg-gradient-to-b from-muted/40 to-background py-24 md:py-32">
        <Container className="flex flex-col items-center justify-center text-center">
          <motion.h1
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
            className="mb-4 font-sans text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
          >
            Thoughts on Design &amp; Code
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.1 }}
            className="mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            A minimal space for exploring the intersection of minimalist design and modern web development.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.5, delay: shouldReduceMotion ? 0 : 0.2 }}
          >
            <Link to="/articles">
              <Button size="lg">Read Articles</Button>
            </Link>
          </motion.div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="mb-8 font-sans text-2xl font-bold">Featured Story</h2>
          <div className="group relative grid overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg md:grid-cols-2">
            <div className="aspect-video overflow-hidden md:aspect-auto md:rounded-l-xl">
              <img
                src={featuredArticle.coverImage}
                alt={featuredArticle.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col justify-center p-6 md:p-8">
              <div className="mb-2 flex items-center space-x-2 text-sm text-muted-foreground">
                <span>
                  {new Date(featuredArticle.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span>•</span>
                <span>{calculateReadingTime(featuredArticle.content)}</span>
              </div>
              <Link to={`/articles/${featuredArticle.slug}`}>
                <h3 className="mb-2 font-sans text-2xl font-bold group-hover:text-primary md:text-3xl">
                  {featuredArticle.title}
                </h3>
              </Link>
              <p className="mb-4 text-muted-foreground">{featuredArticle.excerpt}</p>
              <div className="mt-auto flex items-center space-x-2">
                <img
                  src="/anuj.png"
                  alt={featuredArticle.author}
                  className="h-8 w-8 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <span className="text-sm font-medium">{featuredArticle.author}</span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      <Section className="bg-muted/30">
        <Container>
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-sans text-2xl font-bold">Recent Articles</h2>
            <Link to="/articles">
              <Button variant="ghost">View All</Button>
            </Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recentArticles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                readingTime={calculateReadingTime(article.content)}
                index={index}
              />
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="mb-4 font-sans text-3xl font-bold">Stay Updated</h2>
          <p className="mb-8 max-w-md mx-auto text-muted-foreground">
            Have a question or want to get in touch? We'd love to hear from you.
          </p>
          <Link to="/contact">
            <Button size="lg">Get in Touch</Button>
          </Link>
        </Container>
      </Section>
    </>
  );
};

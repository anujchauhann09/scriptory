import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { motion } from 'motion/react';
import emailjs from '@emailjs/browser';

export const Home = () => {
  const featuredArticle = articles[0];
  const recentArticles = articles.slice(1, 4);

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  const handleNewsletterSubmit = async (e) => {
    e.preventDefault();
    setNewsletterStatus('');

    if (!newsletterEmail) {
      setNewsletterStatus('Please enter your email.');
      return;
    }

    setNewsletterLoading(true);

    try {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_CONTACT_TEMPLATE_ID;
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

      if (!serviceId || !templateId || !publicKey) {
        console.warn('EmailJS environment variables missing.');
        setNewsletterStatus('Newsletter not configured.');
        return;
      }

      await emailjs.send(
        serviceId,
        templateId,
        { email: newsletterEmail },
        publicKey
      );

      setNewsletterStatus('Subscribed successfully!');
      setNewsletterEmail('');
    } catch (err) {
      console.error('Newsletter error:', err);
      setNewsletterStatus('Something went wrong. Try again.');
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <>
      <Section className="bg-muted/30">
        <Container className="flex flex-col items-center justify-center text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-4 font-serif text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl"
          >
            Thoughts on Design & Code
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-8 max-w-2xl text-lg text-muted-foreground sm:text-xl"
          >
            A minimal space for exploring the intersection of minimalist design and modern web development.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Link to="/articles">
              <Button size="lg">Read Articles</Button>
            </Link>
          </motion.div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="mb-8 font-serif text-2xl font-bold">Featured Story</h2>
          <div className="group relative grid gap-8 overflow-hidden rounded-xl border bg-card transition-all hover:shadow-lg md:grid-cols-2">
            <div className="relative aspect-video overflow-hidden md:aspect-auto">
              <img
                src={featuredArticle.coverImage}
                alt={featuredArticle.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="flex flex-col justify-center p-6 md:p-8">
              <div className="mb-2 flex items-center space-x-2 text-sm text-muted-foreground">
                <span>{featuredArticle.date}</span>
                <span>•</span>
                <span>{calculateReadingTime(featuredArticle.content)}</span>
              </div>
              <Link to={`/articles/${featuredArticle.slug}`}>
                <h3 className="mb-2 font-serif text-2xl font-bold group-hover:text-primary md:text-3xl">
                  {featuredArticle.title}
                </h3>
              </Link>
              <p className="mb-4 text-muted-foreground">{featuredArticle.excerpt}</p>
              <div className="mt-auto flex items-center space-x-2">
                <img
                  src="https://picsum.photos/seed/author/100/100"
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
            <h2 className="font-serif text-2xl font-bold">Recent Articles</h2>
            <Link to="/articles">
              <Button variant="ghost">View All</Button>
            </Link>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {recentArticles.map((article) => (
              <motion.div
                key={article.id}
                whileHover={{ y: -5 }}
                className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={article.coverImage}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-2 flex items-center space-x-2 text-xs text-muted-foreground">
                    <span>{article.date}</span>
                    <span>•</span>
                    <span>{calculateReadingTime(article.content)}</span>
                  </div>
                  <Link to={`/articles/${article.slug}`}>
                    <h3 className="mb-2 font-serif text-xl font-bold group-hover:text-primary">
                      {article.title}
                    </h3>
                  </Link>
                  <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">
                    {article.excerpt}
                  </p>
                  <div className="mt-auto flex items-center space-x-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {article.tags.join(', ')}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container className="text-center">
          <h2 className="mb-4 font-serif text-3xl font-bold">Stay Updated</h2>
          <p className="mb-8 text-muted-foreground">
            Join the newsletter to receive the latest articles and insights directly in your inbox.
          </p>
          <div className="mx-auto flex max-w-md space-x-2">
            <form onSubmit={handleNewsletterSubmit} className="flex space-x-2">
              <input
                type="email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={newsletterLoading}
                className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {newsletterLoading ? '...' : 'Subscribe'}
              </button>
            </form>

            {newsletterStatus && (
              <p className="mt-2 text-xs">
                {newsletterStatus}
              </p>
            )}
          </div>
        </Container>
      </Section>
    </>
  );
};

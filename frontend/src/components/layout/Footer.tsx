import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../ui/Container';
import { Github, Twitter, Linkedin } from 'lucide-react';
import { newsletterApi } from '../../lib/api';

export const Footer = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  const handleNewsletterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNewsletterStatus('');

    if (!newsletterEmail) {
      setNewsletterStatus('Please enter your email.');
      return;
    }

    setNewsletterLoading(true);

    try {
      const result = await newsletterApi.subscribe(newsletterEmail);
      const messages: Record<string, string> = {
        subscribed: 'Subscribed successfully!',
        resubscribed: "Welcome back — you're subscribed again!",
        already: "You're already subscribed.",
      };
      setNewsletterStatus(messages[result.status] || 'Subscribed successfully!');
      setNewsletterEmail('');
    } catch (err) {
      console.error('Newsletter error:', err);
      setNewsletterStatus(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-border/60 bg-muted/30 py-16 text-muted-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      <Container>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">

          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="h-4 w-4 rotate-45 rounded-[4px] bg-brand shadow-sm shadow-brand/40" />
              <h3 className="font-display text-lg font-extrabold text-foreground">
                Scriptory
              </h3>
            </div>
            <p className="max-w-xs text-sm leading-relaxed">
              Real-world backend engineering — system design, APIs, and production war stories, learned the hard way so you don't have to.
            </p>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-bold uppercase tracking-widest text-brand">Explore</h4>
            <ul className="space-y-3 text-sm">
              <li><Link to="/" className="transition-colors hover:text-foreground">Home</Link></li>
              <li><Link to="/articles" className="transition-colors hover:text-foreground">Articles</Link></li>
              <li><Link to="/about" className="transition-colors hover:text-foreground">About</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-bold uppercase tracking-widest text-brand">Social</h4>
            <div className="flex gap-3">
              <a href="https://github.com/anujchauhann09" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 transition-all hover:border-brand/40 hover:text-brand" aria-label="GitHub">
                <Github className="h-4 w-4" />
              </a>
              <a href="https://x.com/anujchauhannn" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 transition-all hover:border-brand/40 hover:text-brand" aria-label="Twitter">
                <Twitter className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com/in/anujchauhann" className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/40 transition-all hover:border-brand/40 hover:text-brand" aria-label="LinkedIn">
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-5 text-xs font-bold uppercase tracking-widest text-brand">Newsletter</h4>
            <p className="mb-4 text-sm leading-relaxed">
              Subscribe to get the latest updates.
            </p>

            <form onSubmit={handleNewsletterSubmit} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex h-10 w-full rounded-full border border-input bg-background/60 px-4 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={newsletterLoading}
                className="inline-flex h-10 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-sm shadow-brand/25 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
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
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-8 text-center text-xs uppercase tracking-widest text-muted-foreground/70 sm:flex-row sm:text-left">
          <p>&copy; {new Date().getFullYear()} Scriptory. All rights reserved.</p>
          <p>Crafted by Anuj Chauhan</p>
        </div>
      </Container>
    </footer>
  );
};
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../ui/Container';
import { Github, Twitter, Linkedin } from 'lucide-react';
import emailjs from '@emailjs/browser';

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
    <footer className="border-t bg-muted/50 py-12 text-muted-foreground">
      <Container>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              Scriptory
            </h3>
            <p className="text-sm">
              A minimal, elegant blogging platform for sharing thoughts on design and development.
            </p>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-foreground">Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-primary">Home</Link></li>
              <li><Link to="/articles" className="hover:text-primary">Articles</Link></li>
              <li><Link to="/about" className="hover:text-primary">About</Link></li>
              <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-foreground">Social</h4>
            <div className="flex space-x-4">
              <a href="https://github.com/anujchauhann09" className="hover:text-primary transition-colors duration-200" aria-label="GitHub">
                <Github className="h-5 w-5" />
              </a>
              <a href="https://x.com/anujchauhannn" className="hover:text-primary transition-colors duration-200" aria-label="Twitter">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="https://linkedin.com/in/anujchauhann" className="hover:text-primary transition-colors duration-200" aria-label="LinkedIn">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="mb-4 font-semibold text-foreground">Newsletter</h4>
            <p className="mb-4 text-sm">
              Subscribe to get the latest updates.
            </p>

            <form onSubmit={handleNewsletterSubmit} className="flex flex-col gap-2 sm:flex-row">
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
        </div>

        <div className="mt-12 border-t pt-8 text-center text-sm">
          &copy; {new Date().getFullYear()} Scriptory. All rights reserved.
        </div>
      </Container>
    </footer>
  );
};
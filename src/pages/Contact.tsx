import React, { useState } from 'react';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { motion } from 'motion/react';
import emailjs from '@emailjs/browser';
import { Helmet } from 'react-helmet-async';

export const Contact = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const message = (form.elements.namedItem('message') as HTMLTextAreaElement).value;

    if (!name || !email || !message) {
      setError('Please fill in all fields.');
      setLoading(false);
      return;
    }

    try {
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID || 'service_id';
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || 'template_id';
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || 'public_key';
      const contactTemplateId = import.meta.env.VITE_EMAILJS_CONTACT_TEMPLATE_ID || 'contact_template';

      if (serviceId === 'service_id' || templateId === 'template_id' || publicKey === 'public_key' || contactTemplateId === 'contact_template') {
         await new Promise((resolve) => setTimeout(resolve, 1000));
         console.warn('EmailJS keys not set. Simulating success.');
      } else {
         const formData = {
          name: name,
          email: email,
          message: message,
        };

        await emailjs.send(serviceId, templateId, formData, publicKey);
        await emailjs.send(serviceId, contactTemplateId, formData, publicKey);
      }

      setSuccess(true);
      form.reset();
    } catch (err) {
      console.error('EmailJS Error:', err);
      setError('Failed to send message. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact | Scriptory</title>
        <meta name="description" content="Get in touch with me." />
      </Helmet>
      <Section>
        <Container className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="mb-8 text-center font-serif text-4xl font-bold tracking-tight sm:text-5xl">Get in Touch</h1>
            <p className="mb-12 text-center text-lg text-muted-foreground">
              Have a question, a project idea, or just want to say hi? Fill out the form below and I'll get back to you as soon as possible.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border bg-card p-8 shadow-sm">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Name
                </label>
                <Input id="name" name="name" placeholder="Your Name" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Email
                </label>
                <Input id="email" name="email" type="email" placeholder="your.email@example.com" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Your message..."
                  required
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-4 text-sm text-red-500 dark:bg-red-900/20 dark:text-red-400">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-md bg-green-50 p-4 text-sm text-green-500 dark:bg-green-900/20 dark:text-green-400">
                  Message sent successfully! I'll be in touch soon.
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Message'}
              </Button>
            </form>
          </motion.div>
        </Container>
      </Section>
    </>
  );
};

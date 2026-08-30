import React from 'react';
import { Section } from '../components/ui/Section';
import { motion, useReducedMotion } from 'motion/react';

export const About = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Section>
      <motion.div
        className="mx-auto max-w-3xl px-4 sm:px-6"
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
      >
        <span className="text-xs font-bold uppercase tracking-widest text-brand">Who's behind this</span>
        <h1 className="mb-10 mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
          About <span className="text-brand">Me</span>
        </h1>
        <div className="prose prose-lg dark:prose-invert prose-headings:font-display prose-a:text-brand prose-strong:text-foreground marker:text-brand">

          <p>
            Yes, this entire blog is owned, operated, and occasionally broken by <strong>Anuj Chauhan</strong> — one person, one keyboard, zero regrets.
          </p>

          <p>
            I'm a backend-focused software developer who enjoys designing
            scalable systems and building reliable, production-grade APIs.
            My primary interests lie in system design, distributed architecture,
            and performance-oriented backend engineering.
          </p>

          <p>
            This blog is where I share my learnings and insights on backend
            development, system architecture, real-world engineering problems,
            and the evolving ecosystem of modern web technologies.
          </p>

          <h2>My Philosophy</h2>
          <p>
            I believe good software starts with strong fundamentals — clean
            architecture, well-defined contracts, and systems that scale
            gracefully. I focus on building maintainable and resilient backend
            systems rather than just making things work.
          </p>

          <h2>What I Write About</h2>
          <ul>
            <li>
              <strong>Backend Engineering:</strong> FastAPI, Django, Node.js,
              REST API design, authentication, and performance optimization.
            </li>
            <li>
              <strong>System Design:</strong> Scalable architectures,
              event-driven systems, Kafka, and distributed patterns.
            </li>
            <li>
              <strong>AI in Production:</strong> LLM integrations,
              AI-powered features, and practical ML use cases in real systems.
            </li>
            <li>
              <strong>DevOps &amp; Reliability:</strong> Docker, deployment
              workflows, and production best practices.
            </li>
          </ul>

          <h2>Scriptory Labs</h2>
          <p>
            Some ideas click faster when you can poke at them. So alongside the
            writing I built{' '}
            <a href="https://scriptory-labs.vercel.app" target="_blank" rel="noreferrer noopener">
              Scriptory Labs
            </a>{' '}
            — a companion site where a concept from an article becomes something
            you operate rather than read: a system to pull apart, data to move
            through it, and a set of questions at the end to check what actually
            stuck. The first one takes apart the question of what a computer
            really is.
          </p>

          <p>
            Feel free to explore my articles — I'm always open to discussing
            backend systems, architecture, and interesting engineering
            challenges.
          </p>
        </div>
      </motion.div>
    </Section>
  );
};

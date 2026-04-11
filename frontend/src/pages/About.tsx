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
        <div className="prose prose-lg dark:prose-invert">
          <h1 className="mb-8 text-4xl font-bold tracking-tight sm:text-5xl">
            About Me
          </h1>

          <p>
            Hello! I'm a backend-focused software developer who enjoys designing
            scalable systems and building reliable, production-grade APIs. My
            primary interests lie in system design, distributed architecture,
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

import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { motion, useReducedMotion } from 'motion/react';

export const NotFound = () => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
        className="flex flex-col items-center"
      >
        <h1 className="mb-4 font-display text-8xl font-extrabold tracking-tighter text-brand md:text-9xl">404</h1>
        <h2 className="mb-4 font-display text-2xl font-bold">Page Not Found</h2>
        <p className="mb-8 max-w-md text-muted-foreground">
          Oops! The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        <Link to="/">
          <button className="shiny-cta inline-flex h-12 items-center px-8 text-base font-semibold">Go Home</button>
        </Link>
      </motion.div>
    </Container>
  );
};

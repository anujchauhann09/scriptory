import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Button } from '../components/ui/Button';
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
        <h1 className="mb-4 text-8xl font-bold tracking-tight text-primary">404</h1>
        <h2 className="mb-4 text-2xl font-semibold">Page Not Found</h2>
        <p className="mb-8 max-w-md text-muted-foreground">
          Oops! The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>
        <Link to="/">
          <Button size="lg">Go Home</Button>
        </Link>
      </motion.div>
    </Container>
  );
};

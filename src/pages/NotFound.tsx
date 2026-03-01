import React from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Button } from '../components/ui/Button';

export const NotFound = () => {
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="mb-4 font-serif text-6xl font-bold tracking-tight text-primary">404</h1>
      <h2 className="mb-8 text-2xl font-semibold">Page Not Found</h2>
      <p className="mb-8 max-w-md text-muted-foreground">
        Oops! The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
      </p>
      <Link to="/">
        <Button size="lg">Go Home</Button>
      </Link>
    </Container>
  );
};

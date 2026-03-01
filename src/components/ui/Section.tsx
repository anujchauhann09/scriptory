import React from 'react';
import { cn } from '../../utils/cn';

export const Section = ({ className, children }: { className?: string; children: React.ReactNode }) => {
  return (
    <section className={cn('py-12 md:py-16 lg:py-24', className)}>
      {children}
    </section>
  );
};

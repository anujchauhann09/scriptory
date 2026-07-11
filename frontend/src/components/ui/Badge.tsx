import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'brand';
  children?: React.ReactNode;
}

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        {
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80': variant === 'default',
          'border-transparent bg-brand text-brand-foreground shadow-sm shadow-brand/20 hover:brightness-110': variant === 'brand',
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
          'border-border bg-background/40 text-muted-foreground hover:border-brand/40 hover:text-foreground': variant === 'outline',
        },
        className
      )}
      {...props}
    />
  );
};

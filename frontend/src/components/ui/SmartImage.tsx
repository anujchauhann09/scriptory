import React from 'react';
import { cn } from '../../utils/cn';

interface SmartImageProps {
  src?: string;
  alt: string;
  /** Applied to the outer wrapper (e.g. hover scale). */
  className?: string;
  sizes?: string;
  onError?: () => void;
}

/** Responsive, lazy image wrapper for Scriptory media. */
export const SmartImage = ({ src, alt, className, sizes, onError }: SmartImageProps) => {
  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-muted', className)}>
      <img src={src} alt={alt} sizes={sizes} loading="lazy" onError={onError} className="h-full w-full object-cover" />
    </div>
  );
};

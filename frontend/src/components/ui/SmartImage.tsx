import React, { useState } from 'react';
import { cn } from '../../utils/cn';

const isCloudinary = (url?: string) =>
  !!url && url.includes('res.cloudinary.com') && url.includes('/upload/');

// Insert Cloudinary transformations right after `/upload/`.
const tx = (url: string, transform: string) => url.replace('/upload/', `/upload/${transform}/`);

interface SmartImageProps {
  src?: string;
  alt: string;
  /** Applied to the outer wrapper (e.g. hover scale). */
  className?: string;
  sizes?: string;
  onError?: () => void;
}

/**
 * Responsive, lazy image with a blur-up placeholder. For Cloudinary URLs it
 * generates a `srcset` (f_auto,q_auto) + a tiny blurred preview; for other URLs
 * it degrades to a plain lazy <img>.
 */
export const SmartImage = ({ src, alt, className, sizes = '(max-width: 768px) 100vw, 800px', onError }: SmartImageProps) => {
  const [loaded, setLoaded] = useState(false);

  if (!isCloudinary(src)) {
    return (
      <div className={cn('relative h-full w-full overflow-hidden bg-muted', className)}>
        <img src={src} alt={alt} loading="lazy" onError={onError} className="h-full w-full object-cover" />
      </div>
    );
  }

  const url = src!;
  const placeholder = tx(url, 'w_32,e_blur:1000,q_10,f_auto');
  const srcSet = [400, 800, 1200, 1600].map((w) => `${tx(url, `w_${w},c_limit,f_auto,q_auto`)} ${w}w`).join(', ');
  const fallback = tx(url, 'w_1200,c_limit,f_auto,q_auto');

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-muted', className)}>
      <div
        aria-hidden
        className="absolute inset-0 scale-110 bg-cover bg-center blur-xl"
        style={{ backgroundImage: `url("${placeholder}")` }}
      />
      <img
        src={fallback}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={onError}
        className={cn('relative h-full w-full object-cover transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
};

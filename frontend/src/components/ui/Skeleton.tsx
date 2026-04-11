import React from 'react';
import { cn } from '../../utils/cn';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} />
);

export const ArticleCardSkeleton = () => (
  <div className="rounded-xl border bg-card overflow-hidden">
    <Skeleton className="w-full aspect-video rounded-none" />
    <div className="p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  </div>
);

export const ArticleDetailSkeleton = () => (
  <div className="space-y-6">
    <div className="space-y-3">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-5 w-2/3" />
    </div>
    <div className="flex gap-3">
      <Skeleton className="h-6 w-6 rounded-full" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-24" />
    </div>
    <Skeleton className="w-full aspect-video rounded-xl" />
    <div className="space-y-3 pt-4">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  </div>
);

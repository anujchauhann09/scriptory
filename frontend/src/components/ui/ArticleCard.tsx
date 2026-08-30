import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Badge } from '../ui/Badge';
import { SmartImage } from '../ui/SmartImage';
import { type ApiArticle } from '../../lib/api';

interface ArticleCardProps {
  article: ApiArticle;
  index?: number;
}

export const ArticleCard = ({ article, index }: ArticleCardProps) => {
  const [imgError, setImgError] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const formattedDate = new Date(article.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <motion.article
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldReduceMotion ? 0 : (index ?? 0) * 0.05, duration: shouldReduceMotion ? 0 : 0.4 }}
      whileHover={{ y: shouldReduceMotion ? 0 : -6 }}
      className="group card-premium flex flex-col overflow-hidden rounded-2xl"
    >
      <div className="relative w-full aspect-video overflow-hidden">
        {imgError || !article.coverImage ? (
          <div className="h-full w-full bg-gradient-to-br from-muted via-muted to-brand/10" />
        ) : (
          <SmartImage
            src={article.coverImage}
            alt={article.title}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
            className="transition-transform duration-700 ease-out group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {/*
            Rendered only when the article has been filed. An uncategorised
            article shows the date and reading time exactly as it always has —
            no placeholder, no "Uncategorised" label, no layout shift.
          */}
          {article.category && (
            <>
              <Link
                to={`/articles?category=${encodeURIComponent(article.category.slug)}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold uppercase tracking-wide text-brand transition-opacity hover:opacity-80"
              >
                {article.category.name}
              </Link>
              <span className="text-brand">·</span>
            </>
          )}
          <span>{formattedDate}</span>
          <span className="text-brand">·</span>
          <span>{article.readingTime ?? 1} min read</span>
          {/*
            Archived cards only surface in two places — an admin's archived
            listing and a reader's saved articles — but in both the card would
            otherwise be indistinguishable from a live one.
          */}
          {article.archivedAt && (
            <>
              <span className="text-brand">·</span>
              <span className="font-semibold uppercase tracking-wide">Archived</span>
            </>
          )}
        </div>

        <Link to={`/articles/${article.slug}`}>
          <h3 className="font-display text-lg font-bold leading-snug tracking-tight transition-colors group-hover:text-brand">
            {article.title}
          </h3>
        </Link>

        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {article.excerpt}
        </p>

        {article.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  );
};

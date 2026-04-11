import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Badge } from '../ui/Badge';
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
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: shouldReduceMotion ? 0 : (index ?? 0) * 0.05, duration: shouldReduceMotion ? 0 : 0.4 }}
      whileHover={{ y: shouldReduceMotion ? 0 : -5 }}
      className="rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="w-full aspect-video overflow-hidden">
        {imgError || !article.coverImage ? (
          <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/20" />
        ) : (
          <img
            src={article.coverImage}
            alt={article.title}
            className="w-full aspect-video object-cover"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      <div className="p-4 flex flex-col gap-2">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span>{formattedDate}</span>
          <span>·</span>
          <span>{article.readingTime ?? 1} min read</span>
        </div>

        <Link to={`/articles/${article.slug}`}>
          <h3 className="text-lg font-semibold leading-snug hover:text-primary transition-colors">
            {article.title}
          </h3>
        </Link>

        <p className="text-sm text-muted-foreground line-clamp-3 mt-2">
          {article.excerpt}
        </p>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { articlesApi, tagsApi, type ApiArticle, type ApiTag } from '../lib/api';
import { Search } from 'lucide-react';
import { ArticleCard } from '../components/ui/ArticleCard';
import { ArticleCardSkeleton } from '../components/ui/Skeleton';
import { AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/Button';

export const Articles = () => {
  const [articles, setArticles] = useState<ApiArticle[]>([]);
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchArticles = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 9 };
      if (searchQuery) params.search = searchQuery;
      if (selectedTag) params.tag = selectedTag;
      const res = await articlesApi.list(params);
      if (signal?.aborted) return;
      setArticles(res.articles);
      setTotalPages(res.pagination.totalPages);
    } catch (err) {
      if (signal?.aborted) return;
      console.error(err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, searchQuery, selectedTag]);

  useEffect(() => {
    const controller = new AbortController();
    fetchArticles(controller.signal);
    return () => controller.abort();
  }, [fetchArticles]);

  useEffect(() => {
    tagsApi.list().then(setTags).catch(console.error);
  }, []);

  useEffect(() => { setPage(1); }, [searchQuery, selectedTag]);

  return (
    <Section>
      <Container>
        <div className="mb-8 flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <h1 className="text-3xl font-bold">Articles</h1>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search articles..."
              className="pl-10 border-border focus-visible:ring-primary"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <Badge
            variant={selectedTag === null ? 'default' : 'outline'}
            className="cursor-pointer select-none"
            onClick={() => setSelectedTag(null)}
          >
            All
          </Badge>
          {tags.map((tag) => (
            <Badge
              key={tag.name}
              variant={selectedTag === tag.name ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => <ArticleCardSkeleton key={i} />)
            ) : articles.length > 0 ? (
              articles.map((article, index) => (
                <ArticleCard key={article.id} article={article} index={index} />
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No articles found.
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Container>
    </Section>
  );
};

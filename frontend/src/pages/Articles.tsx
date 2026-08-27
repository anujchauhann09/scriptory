import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { articlesApi, tagsApi, categoriesApi, type ApiArticle, type ApiTag, type ApiCategory } from '../lib/api';
import { getCache, setCache } from '../lib/cache';
import { Search } from 'lucide-react';
import { ArticleCard } from '../components/ui/ArticleCard';
import { ArticleCardSkeleton } from '../components/ui/Skeleton';
import { AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/Button';

export const Articles = () => {
  const [params] = useSearchParams();
  const [articles, setArticles] = useState<ApiArticle[]>([]);
  const [tags, setTags] = useState<ApiTag[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState(params.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(params.get('search') || '');
  const [selectedTag, setSelectedTag] = useState<string | null>(params.get('tag'));
  const [selectedCategory, setSelectedCategory] = useState<string | null>(params.get('category'));

  // Sync filters from the URL (e.g. command-palette jumps, deep links).
  useEffect(() => {
    setSelectedTag(params.get('tag'));
    setSelectedCategory(params.get('category'));
    setSearchQuery(params.get('search') || '');
  }, [params]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchArticles = useCallback(async (signal?: AbortSignal) => {
    const cacheKey = `articles:${page}:${debouncedSearch}:${selectedTag ?? ''}:${selectedCategory ?? ''}`;
    const cached = getCache<{ articles: ApiArticle[]; totalPages: number }>(cacheKey);

    // seed instantly from cache (no skeleton), then revalidate in the background
    if (cached) {
      setArticles(cached.articles);
      setTotalPages(cached.totalPages);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const params: Record<string, string | number> = { page, limit: 9 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedTag) params.tag = selectedTag;
      if (selectedCategory) params.category = selectedCategory;
      const res = await articlesApi.list(params);
      if (signal?.aborted) return;
      setArticles(res.articles);
      setTotalPages(res.pagination.totalPages);
      setCache(cacheKey, { articles: res.articles, totalPages: res.pagination.totalPages });
    } catch (err) {
      if (signal?.aborted) return;
      console.error(err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, debouncedSearch, selectedTag, selectedCategory]);

  useEffect(() => {
    const controller = new AbortController();
    fetchArticles(controller.signal);
    return () => controller.abort();
  }, [fetchArticles]);

  useEffect(() => {
    tagsApi.list().then(setTags).catch(console.error);
    // A failure here must not break the page: the category row simply does not
    // render, and every article still lists as it always did.
    categoriesApi.list().then(setCategories).catch(console.error);
  }, []);

  useEffect(() => { setPage(1); }, [debouncedSearch, selectedTag, selectedCategory]);

  return (
    <Section>
      <Container>
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-brand">The Archive</span>
            <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Articles</h1>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search articles..."
              className="h-11 rounded-full border-border bg-background/50 pl-11 focus-visible:ring-brand/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/*
          Categories are the site's learning structure, so they read as a
          primary filter above the free-form tags. The row is only rendered
          once the taxonomy has loaded — and the "All" default means an
          uncategorised article is never hidden by it.
        */}
        {categories.length > 0 && (
          <div className="mb-6">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Learning path
            </span>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? 'brand' : 'outline'}
                className="cursor-pointer select-none px-3.5 py-1"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Badge>
              {categories.map((category) => (
                <Badge
                  key={category.slug}
                  variant={selectedCategory === category.slug ? 'brand' : 'outline'}
                  className="cursor-pointer select-none px-3.5 py-1"
                  title={category.description || undefined}
                  onClick={() =>
                    setSelectedCategory(selectedCategory === category.slug ? null : category.slug)
                  }
                >
                  {category.name}
                  {category.articleCount > 0 && (
                    <span className="ml-1.5 opacity-60">{category.articleCount}</span>
                  )}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/*
          Labelled and hidden-when-empty, mirroring the category row above it.
          Two unlabelled filter rows read as one broken row, and a lone "All"
          badge with no tags beside it looks like a stray control.
        */}
        {tags.length > 0 && (
          <div className="mb-10">
            <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Topics
            </span>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedTag === null ? 'brand' : 'outline'}
                className="cursor-pointer select-none px-3.5 py-1"
                onClick={() => setSelectedTag(null)}
              >
                All
              </Badge>
              {tags.map((tag) => (
                <Badge
                  key={tag.name}
                  variant={selectedTag === tag.name ? 'brand' : 'outline'}
                  className="cursor-pointer select-none px-3.5 py-1"
                  onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => <ArticleCardSkeleton key={i} />)
            ) : articles.length > 0 ? (
              articles.map((article, index) => (
                <ArticleCard key={article.uuid} article={article} index={index} />
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

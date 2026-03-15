import React, { useState } from 'react';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { Search } from 'lucide-react';
import { ArticleCard } from '../components/ui/ArticleCard';
import { AnimatePresence } from 'motion/react';

export const Articles = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(articles.flatMap((article) => article.tags)));

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.excerpt.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTag = selectedTag ? article.tags.includes(selectedTag) : true;

    return matchesSearch && matchesTag;
  });

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

          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className="cursor-pointer select-none"
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredArticles.length > 0 ? (
              filteredArticles.map((article, index) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  readingTime={calculateReadingTime(article.content)}
                  index={index}
                />
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No articles found matching your criteria.
              </div>
            )}
          </AnimatePresence>
        </div>

      </Container>
    </Section>
  );
};

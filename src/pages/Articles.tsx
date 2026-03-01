import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { motion } from 'motion/react';
import { Search } from 'lucide-react';

export const Articles = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const allTags = Array.from(new Set(articles.flatMap((article) => article.tags)));

  const filteredArticles = articles.filter((article) => {
    const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTag ? article.tags.includes(selectedTag) : true;
    return matchesSearch && matchesTag;
  });

  return (
    <Section>
      <Container>
        <div className="mb-8 flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <h1 className="font-serif text-3xl font-bold">Articles</h1>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search articles..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <Badge
            variant={selectedTag === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setSelectedTag(null)}
          >
            All
          </Badge>
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={selectedTag === tag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {filteredArticles.length > 0 ? (
            filteredArticles.map((article) => (
              <motion.div
                key={article.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                whileHover={{ y: -5 }}
                className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={article.coverImage}
                    alt={article.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="mb-2 flex items-center space-x-2 text-xs text-muted-foreground">
                    <span>{article.date}</span>
                    <span>•</span>
                    <span>{calculateReadingTime(article.content)}</span>
                  </div>
                  <Link to={`/articles/${article.slug}`}>
                    <h3 className="mb-2 font-serif text-xl font-bold group-hover:text-primary">
                      {article.title}
                    </h3>
                  </Link>
                  <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">
                    {article.excerpt}
                  </p>
                  <div className="mt-auto flex items-center space-x-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {article.tags.join(', ')}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No articles found matching your criteria.
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
};

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Container } from '../components/ui/Container';
import { Section } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { articles } from '../data/articles';
import { calculateReadingTime } from '../utils/readingTime';
import { motion } from 'motion/react';
import { ArrowLeft, Clock, Calendar, User } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export const ArticleDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <Container className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <h1 className="mb-4 text-4xl font-bold">Article Not Found</h1>
        <p className="mb-8 text-muted-foreground">The article you are looking for does not exist.</p>
        <Link to="/articles">
          <Button>Back to Articles</Button>
        </Link>
      </Container>
    );
  }

  return (
    <>
      <Helmet>
        <title>{article.title} | Scriptory</title>
        <meta name="description" content={article.excerpt} />
      </Helmet>
      
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Section className="pb-8 pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <Link to="/articles" className="mb-8 inline-flex items-center text-sm text-muted-foreground hover:text-primary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Articles
            </Link>
            
            <div className="mb-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
            
            <h1 className="mb-4 font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {article.title}
            </h1>
            
            <p className="mb-8 text-xl text-muted-foreground md:text-2xl">
              {article.subtitle}
            </p>
            
            <div className="flex items-center justify-between border-b border-border pb-8 text-sm text-muted-foreground">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <User className="mr-2 h-4 w-4" />
                  <span className="font-medium text-foreground">{article.author}</span>
                </div>
                <div className="flex items-center">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>{article.date}</span>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="mr-2 h-4 w-4" />
                <span>{calculateReadingTime(article.content)}</span>
              </div>
            </div>
          </Container>
        </Section>

        <div className="w-full bg-muted/20">
          <Container className="max-w-5xl px-0 sm:px-6 lg:px-8">
            <div className="relative aspect-video w-full overflow-hidden sm:rounded-xl">
              <img
                src={article.coverImage}
                alt={article.title}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </Container>
        </div>

        <Section className="pt-12 md:pt-16">
          <Container className="max-w-3xl">
            <article 
              className="prose prose-lg prose-slate dark:prose-invert md:prose-xl font-sans"
              dangerouslySetInnerHTML={{ __html: article.content }}
            />
          </Container>
        </Section>
      </motion.div>
    </>
  );
};

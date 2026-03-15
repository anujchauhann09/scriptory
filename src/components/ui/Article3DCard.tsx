"use client";

import React from "react";
import { Link } from "react-router-dom";
import { CardContainer, CardBody, CardItem } from "./3d-card";

interface Props {
  article: any;
  readingTime: string;
}

export const Article3DCard: React.FC<Props> = ({ article, readingTime }) => {
  return (
    <CardContainer className="w-full">
      <CardBody className="relative group/card bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl">

        <CardItem translateZ="100" className="w-full">
          <div className="relative aspect-video overflow-hidden">
            <img
              src={article.coverImage}
              alt={article.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105"
            />
          </div>
        </CardItem>

        <div className="flex flex-col p-6">

          <CardItem
            translateZ="40"
            className="mb-2 flex items-center space-x-2 text-xs text-muted-foreground"
          >
            <span>{article.date}</span>
            <span>•</span>
            <span>{readingTime}</span>
          </CardItem>

          <CardItem
            translateZ="70"
            className="mb-2 font-serif text-xl font-bold hover:text-primary"
          >
            <Link to={`/articles/${article.slug}`}>
              {article.title}
            </Link>
          </CardItem>

          <CardItem
            translateZ="60"
            as="p"
            className="mb-4 line-clamp-3 text-sm text-muted-foreground"
          >
            {article.excerpt}
          </CardItem>

          <CardItem
            translateZ="30"
            className="mt-auto text-xs font-medium text-muted-foreground"
          >
            {article.tags.join(", ")}
          </CardItem>

        </div>
      </CardBody>
    </CardContainer>
  );
};
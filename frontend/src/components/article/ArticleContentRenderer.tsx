import React from 'react';
import { markdownToHtml, type ArticleBlock, type ArticleContentSource } from '../../lib/article-content/content';
import { sanitizeArticleHtml } from '../../lib/sanitize';

const videoSrc = (block: Extract<ArticleBlock, { type: 'video' }>) => {
  if (block.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(block.id)}`;
  return `https://player.vimeo.com/video/${encodeURIComponent(block.id)}`;
};

const MarkdownRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'markdown' }> }) => (
  <div dangerouslySetInnerHTML={{ __html: markdownToHtml(block.markdown) }} />
);

const ImageRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'image' }> }) => (
  <figure>
    <img
      src={block.src}
      alt={block.alt}
      width={block.width}
      height={block.height}
      loading="lazy"
      decoding="async"
    />
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>
);

const VideoRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'video' }> }) => (
  <figure className="article-video">
    <div className="article-video-frame">
      <iframe
        src={videoSrc(block)}
        title={block.title || `${block.provider} video`}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>
);

const VideoFileRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'videoFile' }> }) => (
  <figure className="article-video">
    <div className="article-video-frame">
      <video controls preload="metadata" poster={block.poster} title={block.title}>
        <source src={block.src} type="video/mp4" />
      </video>
    </div>
    {block.caption && <figcaption>{block.caption}</figcaption>}
  </figure>
);

const CodeRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'code' }> }) => (
  <div className="article-code-block">
    {block.filename && <div className="article-code-filename">{block.filename}</div>}
    <pre><code className={block.language ? `language-${block.language}` : undefined}>{block.code}</code></pre>
  </div>
);

const CalloutRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'callout' }> }) => (
  <div className={`callout callout-${block.tone}`}>
    <p className="callout-title">{block.tone}</p>
    <div dangerouslySetInnerHTML={{ __html: markdownToHtml(block.content) }} />
  </div>
);

const DiagramRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'diagram' }> }) => (
  <pre><code className="language-mermaid">{block.source}</code></pre>
);

const RichLinkRenderer = ({ block }: { block: Extract<ArticleBlock, { type: 'richLink' }> }) => (
  <a href={block.url} target="_blank" rel="noopener noreferrer nofollow" className="rich-link-card">
    {block.image && <img src={block.image} alt="" loading="lazy" decoding="async" />}
    <span>
      <strong>{block.title || block.url}</strong>
      {block.description && <em>{block.description}</em>}
      <small>{new URL(block.url).hostname.replace(/^www\./, '')}</small>
    </span>
  </a>
);

const renderers = {
  markdown: MarkdownRenderer,
  image: ImageRenderer,
  video: VideoRenderer,
  videoFile: VideoFileRenderer,
  code: CodeRenderer,
  callout: CalloutRenderer,
  diagram: DiagramRenderer,
  richLink: RichLinkRenderer,
};

const BlockRenderer = ({ block }: { block: ArticleBlock }) => {
  if (block.type === 'layout') {
    return (
      <div className="content-layout content-layout-side-by-side">
        {block.blocks.map((child, index) => <BlockRenderer key={index} block={child} />)}
      </div>
    );
  }
  const Renderer = renderers[block.type] as React.ComponentType<{ block: any }>;
  return <Renderer block={block} />;
};

export const ArticleContentRenderer = ({ source, legacyHtml }: { source?: ArticleContentSource | null; legacyHtml: string }) => {
  if (!source) {
    return <div dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(legacyHtml) }} />;
  }
  return <>{source.blocks.map((block, index) => <BlockRenderer key={index} block={block} />)}</>;
};

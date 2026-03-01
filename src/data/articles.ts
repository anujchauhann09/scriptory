export interface Article {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  date: string;
  author: string;
  tags: string[];
  coverImage: string;
  excerpt: string;
  content: string;
}

export const articles: Article[] = [
  {
    id: "1",
    title: "The Art of Minimalist Design in Modern Web Development",
    subtitle: "Why less is often more when building user interfaces.",
    slug: "minimalist-design-web-development",
    date: "2023-10-15",
    author: "Alex Dev",
    tags: ["Design", "Web Development", "Minimalism"],
    coverImage: "https://picsum.photos/seed/minimal/800/400",
    excerpt: "In a world of clutter, minimalist design stands out by focusing on what truly matters. Learn how to implement it effectively.",
    content: `
      <h2>The Philosophy of Less</h2>
      <p>Minimalism isn't just about removing elements; it's about prioritizing the essential. In web development, this translates to faster load times, clearer navigation, and a more focused user experience.</p>
      
      <h3>Whitespace is Your Friend</h3>
      <p>One of the most powerful tools in a minimalist's arsenal is whitespace. It gives content room to breathe and guides the user's eye naturally through the page.</p>
      
      <blockquote>"Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away." - Antoine de Saint-Exupéry</blockquote>
      
      <h3>Typography Matters</h3>
      <p>When you strip away heavy graphics and complex layouts, typography becomes the hero. Choosing the right typeface pairing can define the entire mood of your application.</p>
    `,
  },
  {
    id: "2",
    title: "Understanding React Server Components",
    subtitle: "A deep dive into the future of React rendering.",
    slug: "react-server-components",
    date: "2023-11-02",
    author: "Alex Dev",
    tags: ["React", "JavaScript", "Frontend"],
    coverImage: "https://picsum.photos/seed/react/800/400",
    excerpt: "React Server Components are changing the way we think about building React applications. Here's what you need to know.",
    content: `
      <h2>What are Server Components?</h2>
      <p>React Server Components allow you to render components on the server, reducing the amount of JavaScript sent to the client. This leads to faster initial page loads and improved performance.</p>
      
      <h3>The Benefits</h3>
      <ul>
        <li><strong>Zero Bundle Size:</strong> Server components aren't included in the client bundle.</li>
        <li><strong>Direct Backend Access:</strong> Access your database or file system directly from your component.</li>
        <li><strong>Automatic Code Splitting:</strong> Client components imported by server components are automatically code-split.</li>
      </ul>
    `,
  },
  {
    id: "3",
    title: "Mastering Tailwind CSS for Rapid Prototyping",
    subtitle: "Build beautiful interfaces without leaving your HTML.",
    slug: "mastering-tailwind-css",
    date: "2023-12-10",
    author: "Alex Dev",
    tags: ["CSS", "Tailwind", "Design"],
    coverImage: "https://picsum.photos/seed/tailwind/800/400",
    excerpt: "Tailwind CSS has revolutionized the way developers style applications. Discover tips and tricks for efficient usage.",
    content: `
      <h2>Utility-First Workflow</h2>
      <p>Tailwind's utility-first approach might seem counterintuitive at first, but it dramatically speeds up the development process once you get the hang of it.</p>
      
      <h3>Customization</h3>
      <p>Tailwind is highly customizable. You can define your own design system in the <code>tailwind.config.js</code> file, ensuring consistency across your project.</p>
    `,
  },
  {
    id: "4",
    title: "The Future of Frontend Architecture",
    subtitle: "Trends to watch in 2024 and beyond.",
    slug: "future-frontend-architecture",
    date: "2024-01-05",
    author: "Alex Dev",
    tags: ["Architecture", "Frontend", "Trends"],
    coverImage: "https://picsum.photos/seed/future/800/400",
    excerpt: "From micro-frontends to island architecture, the frontend landscape is evolving rapidly.",
    content: `
      <h2>Islands Architecture</h2>
      <p>Islands architecture, popularized by frameworks like Astro, allows you to ship mostly static HTML and hydrate only the interactive parts of your page.</p>
      
      <h2>Edge Computing</h2>
      <p>Moving logic closer to the user via edge functions is becoming increasingly common, reducing latency and improving the user experience.</p>
    `,
  }
];

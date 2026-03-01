# Scriptory

A clean, elegant, and performant blogging platform built with React, Tailwind CSS, and Framer Motion. Designed with a focus on typography and reading experience, inspired by Medium but with a unique, minimalist aesthetic.

## Features

- **Premium Reading Experience:** Optimized typography, generous whitespace, and distraction-free layout.
- **Dark/Light Mode:** Seamless theme toggling with system preference detection.
- **Responsive Design:** Fully responsive layout that looks great on all devices.
- **Article Management:** Admin-managed content via code (no backend required).
- **Tag Filtering:** Filter articles by tags for easy discovery.
- **Reading Time:** Automatic reading time calculation for all articles.
- **Contact Form:** Functional contact form integrated with EmailJS.
- **Smooth Animations:** Page transitions and micro-interactions using Framer Motion.
- **SEO Optimized:** Dynamic metadata for better search engine visibility.

## Tech Stack

- **Frontend:** React (Vite), TypeScript
- **Styling:** Tailwind CSS
- **Routing:** React Router DOM
- **Icons:** Lucide React
- **Animations:** Framer Motion
- **Forms:** EmailJS
- **SEO:** React Helmet Async

## Folder Structure

```
/src
  /components
    /layout       # Navbar, Footer, LayoutWrapper
    /ui           # Reusable UI components (Button, Input, Badge, etc.)
  /context        # ThemeContext
  /data           # Static article data
  /pages          # Page components (Home, Articles, ArticleDetail, etc.)
  /utils          # Utility functions (cn, readingTime)
  App.tsx         # Main application component with routing
  main.tsx        # Entry point
  index.css       # Global styles and Tailwind configuration
```

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/anujchauhann09/scriptory.git
    cd scriptory
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

4.  **Build for production:**
    ```bash
    npm run build
    ```

## 📧 EmailJS Setup

To make the contact form functional, you need to set up EmailJS:

1.  Create an account at [EmailJS](https://www.emailjs.com/).
2.  Create a new **Email Service** (e.g., Gmail).
3.  Create an **Email Template**.
4.  Get your **Service ID**, **Template ID**, and **Public Key** from the dashboard.
5.  Create a `.env` file in the root directory (copy from `.env.example`) and add your keys:

    ```env
    VITE_EMAILJS_SERVICE_ID="your_service_id"
    VITE_EMAILJS_TEMPLATE_ID="your_template_id"
    VITE_EMAILJS_PUBLIC_KEY="your_public_key"
    ```

## Deployment

This project is optimized for deployment on Vercel or Netlify.

### Vercel

1.  Push your code to a GitHub repository.
2.  Import the project into Vercel.
3.  Vercel will automatically detect the Vite settings.
4.  Add your environment variables (EmailJS keys) in the Vercel dashboard.
5.  Deploy!

## Customization

-   **Theme:** Modify colors and fonts in `src/index.css` and `tailwind.config.js` (or `@theme` block).
-   **Content:** Add or edit articles in `src/data/articles.ts`.
-   **Components:** Customize UI components in `src/components/ui`.

## License

This project is open source and available under the [MIT License](LICENSE).

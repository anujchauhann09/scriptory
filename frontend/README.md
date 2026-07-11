# Scriptory — Frontend

React + TypeScript frontend for the Scriptory blogging platform. Connects to the Express/Prisma backend API.

## Tech Stack

- React 18, TypeScript, Vite
- Tailwind CSS v4 + `@tailwindcss/typography`
- Framer Motion (`motion`)
- React Router DOM v7
- Lucide React (icons)
- React Helmet Async (SEO / meta / JSON-LD)
- marked + DOMPurify (markdown → sanitized HTML), highlight.js (code), mermaid (diagrams) — all **lazy-loaded**
- Geist + Manrope fonts (premium "red-noir" design system)

## Project Structure

```
frontend/
├── public/              # Static assets (images, favicon)
├── src/
│   ├── components/
│   │   ├── layout/      # Navbar (⌘K button), Footer, LayoutWrapper
│   │   ├── ui/          # Button, Input, Badge, Container, Section, ArticleCard,
│   │   │                # Skeleton, ImageUpload, SmartImage (responsive+blur-up), Reveal (scroll-reveal)
│   │   ├── CommandPalette.tsx    # ⌘K search / navigation / theme toggle
│   │   └── SecuritySettings.tsx  # Change password + 2FA setup/disable
│   ├── context/
│   │   ├── AuthContext.tsx   # Cookie-session auth state
│   │   └── ThemeContext.tsx  # Dark/light mode
│   ├── lib/
│   │   ├── api.ts          # Central fetch client (credentials: 'include')
│   │   ├── cache.ts        # Tiny in-memory SWR cache
│   │   ├── highlighter.ts  # highlight.js core + curated languages (lazy)
│   │   └── mermaid.ts      # Mermaid diagram renderer (lazy)
│   ├── pages/
│   │   ├── Home.tsx          Articles.tsx      ArticleDetail.tsx
│   │   ├── WriteArticle.tsx  Profile.tsx       Login.tsx        Admin.tsx
│   │   ├── Author.tsx        About.tsx         Contact.tsx      NotFound.tsx
│   ├── utils/
│   │   └── cn.ts        # Tailwind class merge utility
│   ├── App.tsx          # Routes + guards + lazy-loaded routes
│   ├── main.tsx         # Mounts app + imports highlight.js theme
│   └── index.css        # Design tokens, brand utilities, prose (callouts/sepia/code) overrides
└── index.html
```

## Pages & Features

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero, **stats strip**, featured article (scroll-reveal), recent grid |
| Articles | `/articles` | Paginated list, tag filter + debounced full-text search (reads `?tag`/`?search`) |
| Article Detail | `/articles/:slug` | Rich content (**syntax highlighting, callouts, Mermaid, series**), **TOC + scroll-spy**, **reading themes** (font size + sepia), progress "% / min left", **bookmark**, likes, comments, share, related, back-to-top |
| Write / Edit | `/write` | **Full-markdown editor** (marked), callout/collapsible/diagram toolbar, cover upload, tags, **series**, **schedule publish**, draft toggle (**admin**) |
| Admin | `/admin` | **Overview** (stats + charts), Inbox, Subscribers (CSV + **send digest**), Activity (**admin**) |
| Profile | `/profile` | Edit profile, **Security** (change password, 2FA), **Saved articles** (bookmarks) |
| Author | `/author` | Bio, avatar, social links, all articles + Person JSON-LD |
| Login | `/login` | Sign in / register, with a 2FA code step |
| About / Contact | `/about` · `/contact` | Author bio · contact form (posts to backend) |

## Getting Started

```bash
cd frontend
cp .env.example .env
npm install
npm run dev            # runs on :3000
```

## Environment Variables

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

`VITE_API_URL` must point to the running backend. That's the only variable the frontend needs — contact/newsletter and email are handled entirely by the backend.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type check |

## Auth & Roles

Auth uses an **httpOnly session cookie** set by the backend — the token is never stored in JavaScript (XSS-safe). `AuthContext`:

- caches a **non-sensitive user snapshot** in `localStorage` (`auth_user`) for instant paint,
- revalidates the session on load via `GET /users/me` (the cookie is sent automatically),
- exposes `login(email, password, totp?)`, `register`, `logout`, `refreshUser`, `updateProfile`.

Login is 2FA-aware: if the account has 2FA, `authApi.login` throws `TwoFactorRequiredError` and the Login page shows a code step.

Roles:
- `USER` — like articles, post/delete own comments, edit profile, manage own 2FA
- `ADMIN` — all of the above plus write/edit/delete articles, delete any comment, admin Inbox

Protected routes use `<AdminRoute>` (admin only) and `<ProtectedRoute>` (any logged-in user). Secondary routes (Admin, WriteArticle, Profile, Login, Contact, About, Author) are **lazy-loaded** to keep the initial bundle small.

## API Client

All backend calls go through `src/lib/api.ts`. Every request sends `credentials: 'include'` so the session cookie flows automatically (no manual token handling). Exports:

- `articlesApi` — list, get, **related**, create, update, delete, incrementView
- `commentsApi` · `likesApi` · `bookmarksApi` · `tagsApi` · `uploadApi` · `userApi`
- `authApi` — login, register, logout, changePassword, `twoFactor.{setup,enable,disable}`
- `contactApi` — submit, list, setHandled, remove
- `newsletterApi` — subscribe, listSubscribers, removeSubscriber, **sendDigest**
- `statsApi` · `analyticsApi` · `auditApi`

`cache.ts` provides `getCache` / `setCache` / `clearCache` for the stale-while-revalidate pattern on Home, Articles, and Article Detail. `highlighter.ts` and `mermaid.ts` are dynamically imported only when an article contains code / a diagram, keeping the initial bundle lean. Lazy-loaded routes: About, Author, Contact, Login, Profile, WriteArticle, Admin.

## Deployment

Build with `npm run build` and deploy `dist/` to Vercel, Netlify, or any static host. Set `VITE_API_URL` to your deployed backend URL. For Vercel, the included `vercel.json` handles SPA routing rewrites.

> The backend must allow credentialed CORS from this origin, and in production both should be served over HTTPS (secure cookies). If they're on different sites, the backend needs `COOKIE_SAMESITE=none`.

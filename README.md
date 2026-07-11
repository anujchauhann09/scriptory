# Scriptory

A full-stack blogging platform built with React + Node.js. Premium reading experience, rich markdown authoring, admin-managed content, secure authentication, and a REST API backend with PostgreSQL.

## Tech Stack

**Frontend** — React 18 (Vite), TypeScript, Tailwind CSS v4, Framer Motion, React Router, React Helmet Async, marked + DOMPurify (markdown), highlight.js (code), mermaid (diagrams)

**Backend** — Node.js, Express, Prisma ORM, PostgreSQL, cookie-based JWT auth, TOTP 2FA (otplib), Nodemailer (SMTP), Cloudinary (uploads), sharp (OG images), node-cron (scheduling), Gemini embeddings (related posts), Winston logging

## Features

### Authoring & content
- **Full-markdown editor** (marked, CommonMark + GFM) — headings, nested lists, task lists, tables, fenced code, blockquotes, images, raw HTML — sanitized with DOMPurify
- **Callout blocks** (`> [!NOTE]` / TIP / WARNING …), **collapsible `<details>`**, and **Mermaid diagrams** (```mermaid)
- Cover image, tags, excerpt, **series/collections**, **draft scheduling** (`publishAt` + cron auto-publish)
- **Full-text search** (Postgres FTS, relevance-ranked over title + excerpt + content)

### Reading experience
- **Syntax highlighting** (lazy-loaded), **table of contents** (sticky, scroll-spy), **back-to-top**
- **Reading themes** — adjustable font size + sepia mode; reading progress bar with "% read / min left"
- **Bookmarks / read-later** (saved list on the profile), likes, comments, share buttons
- **Related posts** by content-embedding similarity (Gemini) with a shared-tag fallback
- Unique view tracking (per user / anonymous fingerprint), auto reading-time

### Accounts & security
- **httpOnly-cookie sessions** — JWT never exposed to JS (XSS-safe); **TOTP 2FA**; **session revocation**
- Constant-time login (no user enumeration), bcrypt (cost 12), change password, role-based access
- **Audit log** of security & admin actions

### Admin panel (`/admin`)
- **Overview** — stat tiles, 30-day views chart, top posts
- **Inbox** (contact messages: mark handled / delete), **Subscribers** (CSV export, delete, **send digest**), **Activity** (audit log)

### Contact & newsletter (backend-persisted)
- Contact form + newsletter subscribe stored in PostgreSQL, emailed via SMTP (branded templates)
- Honeypot + rate limiting; two-step unsubscribe; **weekly digest automation** (opt-in cron)

### Discovery & SEO
- **RSS feed**, **sitemap.xml**, **robots.txt**; per-page canonical/OG/Twitter meta + JSON-LD
- **Auto-generated branded OG images** (1200×630 PNG per article, via sharp)
- Dedicated **author page** with Person JSON-LD

### Experience & performance
- Premium "red-noir" design (glassmorphism, brand accent, Manrope), dark / light mode
- **Command palette (⌘K)**, **homepage stats strip**, scroll-reveal micro-interactions
- **Image optimization** (`SmartImage`: Cloudinary responsive `srcset` + blur-up)
- SWR in-memory caching, route code-splitting, debounced search

## Project Structure

```
scriptory/
├── backend/                  # Express API
│   ├── prisma/               # schema.prisma, migrations, seed.js
│   └── src/
│       ├── config/           # db, cloudinary, mailer, env
│       ├── middleware/       # auth (cookie), admin, error, optionalAuth
│       ├── modules/
│       │   ├── auth/  user/  article/  comment/  like/  view/  tag/  upload/
│       │   ├── bookmark/     # save / status / list
│       │   ├── contact/  newsletter/   # submit/subscribe + admin manage + digest
│       │   ├── analytics/  stats/       # admin overview + public totals
│       │   ├── audit/  feed/  og/       # audit log, rss/sitemap/robots, OG images
│       ├── utils/            # audit, emailTemplate, embedding, logger, response, …
│       ├── scheduler.js      # node-cron: draft auto-publish + weekly digest
│       └── server.js
└── frontend/                 # React app
    ├── public/
    └── src/
        ├── components/       # layout, ui (SmartImage, Reveal, …), CommandPalette, SecuritySettings
        ├── context/          # AuthContext (cookie), ThemeContext
        ├── lib/              # api.ts, cache.ts (SWR), highlighter.ts, mermaid.ts (lazy)
        ├── pages/            # Home, Articles, ArticleDetail, WriteArticle, Profile,
        │                     # Login, Admin, Author, About, Contact, NotFound
        └── utils/
```

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL database
- Cloudinary account (image uploads)
- Optional: SMTP credentials (emails), `GEMINI_API_KEY` (embedding-based related posts)

### Backend
```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npx prisma migrate dev
npm run seed           # creates admin (only if ADMIN_EMAIL/ADMIN_PASSWORD set)
npm run dev            # runs on :5000
```

### Frontend
```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev            # runs on :3000
```

### Key backend `.env` variables
```env
DATABASE_URL=postgresql://user:password@localhost:5432/scriptory
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1d
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:5000          # public URL of THIS API (email/OG links)

# Auth cookie (sameSite=lax same-site; use "none" + HTTPS if cross-site)
COOKIE_SAMESITE=lax
TWO_FACTOR_ISSUER=Scriptory

# Admin seed — blank = skip seeding (only used on first seed, NOT to change the password later)
ADMIN_EMAIL=
ADMIN_PASSWORD=

# Cloudinary (uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# SMTP (optional — emails logged & skipped if unset; data still persists)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Scriptory <no-reply@scriptory.com>
CONTACT_RECIPIENT=

# Newsletter digest cron (opt-in, sends real email)
NEWSLETTER_DIGEST_ENABLED=false
NEWSLETTER_DIGEST_CRON=0 9 * * 1

# Related posts via embeddings (optional; falls back to tags without a key)
GEMINI_API_KEY=
EMBEDDING_MODEL=text-embedding-004
```

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` · `login` · `logout` | — | Auth (login takes optional `totp`) |
| POST | `/api/auth/change-password` · `2fa/{setup,enable,disable}` | User | Password + TOTP 2FA |
| GET/PATCH | `/api/users/me` · `me/profile` | User | Current user / update profile |
| GET/POST/PUT/DELETE | `/api/articles` · `/:slug` · `/:uuid` | —/Admin | List (FTS) / read / CRUD |
| GET | `/api/articles/:slug/related` | — | Related posts (embeddings → tag fallback) |
| GET/POST | `/api/articles/:slug/likes` · `views` · `comments` · `bookmark` | Optional/User | Engagement |
| GET | `/api/bookmarks` | User | Saved articles |
| POST/GET/PATCH/DELETE | `/api/contact` · `/:uuid` | —/Admin | Submit / list / handle / delete |
| POST/GET | `/api/newsletter/{subscribe,unsubscribe,subscribers,digest}` | —/Admin | Subscribe / unsubscribe / manage / digest |
| GET | `/api/analytics` · `/api/audit` | Admin | Dashboard + audit log |
| GET | `/api/stats` · `/api/tags` | — | Public totals + tags |
| POST | `/api/upload/{cover,inline,avatar}` | Admin/User | Cloudinary uploads |
| GET | `/rss.xml` · `/sitemap.xml` · `/robots.txt` · `/og/:slug.png` | — | Feeds + OG images (served at root) |

See `backend/README.md` for the full reference.

## Deployment

**Backend** — any Node.js host (Railway, Render, Fly.io). Run `npx prisma migrate deploy` on each deploy (migrations do **not** run on server start). Set `API_URL` to the public backend URL; use HTTPS in production (secure cookies). `sharp` needs a compatible host. The scheduler runs in-process — run a **single** instance (or one dedicated worker) to avoid duplicate digest sends.

**Frontend** — Vercel or Netlify. Set `VITE_API_URL` to your deployed backend URL. The included `vercel.json` handles SPA routing.

> If the frontend and API are on **different sites** in production, set `COOKIE_SAMESITE=none` (HTTPS required) so the session cookie is sent cross-site.

## License

MIT

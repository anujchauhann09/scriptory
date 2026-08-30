# Scriptory

A full-stack blogging platform built with React + Node.js. Premium reading experience, rich markdown authoring, admin-managed content, secure authentication, and a REST API backend with PostgreSQL.

## Tech Stack

**Frontend** — React 18 (Vite), TypeScript, Tailwind CSS v4, Framer Motion, React Router, React Helmet Async, marked + DOMPurify (markdown), highlight.js (code), mermaid (diagrams)

**Backend** — Node.js, Express, Prisma ORM, PostgreSQL, cookie-based JWT auth, TOTP 2FA (otplib), Nodemailer (SMTP), GCS media storage (uploads), sharp (OG images), node-cron (scheduling), Gemini embeddings (related posts), Winston logging

## Features

### Authoring & content
- **Full-markdown editor** (marked, CommonMark + GFM) — headings, nested lists, task lists, tables, fenced code, blockquotes, images, raw HTML — sanitized with DOMPurify
- **Callout blocks** (`> [!NOTE]` / TIP / WARNING …), **collapsible `<details>`**, and **Mermaid diagrams** (```mermaid)
- **Inline media** — images, GIFs and **WebM animations** (up to 10MB) through one toolbar button; a WebM is inserted as a silent looping `:::animation` block, the GIF-style alternative to the separate MP4 video block
- Cover image, tags, excerpt, **series/collections**, **draft scheduling** (`publishAt` + cron auto-publish)
- **Archiving** — retire an article from discovery *without* breaking its URL. An archived post stays fully readable, keeps its comments, likes and view count, and drops out of the archive listing, search, related posts, the RSS feed, the sitemap and the newsletter digest. Its comment thread stays visible but closes to new replies. Reversible from the article page (admin), and distinct from a draft: a draft was never released, an archived post was
- **Learning categories** — a curated path (Backend Engineering → System Design → DSA & CS → Cloud → DevOps → AI/ML), **managed from Admin → Categories** (create / rename / reorder / delete). **Always optional:** an article can publish with no category and be filed later without touching the article; deleting a category unfiles its articles rather than deleting them. See [docs/content-strategy.md](docs/content-strategy.md)
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
- **CSRF protection** by strict Origin verification on every cookie-authenticated state change
- **Brute-force lockout** enforced in the database, so it holds across all instances
- **Server-side HTML sanitisation** of article content on write, and again on render
- Per-endpoint rate limiting, request-size and timeout limits, strict CSP and security headers
- **Audit log** of security & admin actions, with secrets redacted from every log sink

### Admin panel (`/admin`)
- **Overview** — stat tiles (incl. an **Archived** count once anything is archived), 30-day views chart, top posts
- **Categories** — manage the learning path: add, rename, reorder, delete (with article-impact warnings)
- **Inbox** (contact messages: mark handled / delete), **Subscribers** (CSV export, delete, **send digest**), **Activity** (audit log)

### Contact & newsletter (backend-persisted)
- Contact form + newsletter subscribe stored in PostgreSQL, emailed via SMTP (branded templates)
- Honeypot + rate limiting; two-step unsubscribe; **weekly digest automation** (opt-in cron)

### Discovery
- Filter the archive by **category** (`?category=<slug>`) or **tag**; both compose with search
- `?uncategorized=true` lists everything still to be filed
- `?archived=true` (admin only) lists retired articles; archived posts are hidden from every listing otherwise

### Discovery & SEO
- **RSS feed**, **sitemap.xml**, **robots.txt**; per-page canonical/OG/Twitter meta + JSON-LD
- **Auto-generated branded OG images** (1200×630 PNG per article, via sharp)
- Dedicated **author page** with Person JSON-LD

### Experience & performance
- Premium "red-noir" design (glassmorphism, brand accent, Manrope), dark / light mode
- **Command palette (⌘K)**, **homepage stats strip**, scroll-reveal micro-interactions
- **Image rendering** (`SmartImage`: lazy image rendering for GCS media)
- SWR in-memory caching, route code-splitting, debounced search

## Project Structure

```
scriptory/
├── backend/                  # Express API
│   ├── Dockerfile            # multi-stage, non-root, dumb-init for signal handling
│   ├── prisma/               # schema.prisma, migrations, seed.js
│   ├── tests/                # security.test.js — access control, CSRF, throttling
│   └── src/
│       ├── config/
│       │   ├── platform.js   # host abstraction (proxy hops, instance cap, region)
│       │   ├── database.js   # pooling + socket/TCP transport
│       │   ├── secrets.js    # env or *_FILE mounted secrets
│       │   └── db, mailer, env
│       ├── middleware/       # auth, admin, optionalAuth, csrf, rateLimit,
│       │                     # security (helmet/CORS), validate, requestContext, error
│       ├── modules/
│       │   ├── auth/  user/  article/  comment/  like/  view/  tag/  upload/
│       │   ├── bookmark/     # save / status / list
│       │   ├── contact/  newsletter/   # submit/subscribe + admin manage + digest
│       │   ├── analytics/  stats/       # admin overview + public totals
│       │   ├── audit/  feed/  og/       # audit log, rss/sitemap/robots, OG images
│       │   ├── health/       # /healthz (liveness), /readyz (readiness)
│       │   └── internal/     # /internal/tasks/* for an external scheduler
│       ├── utils/            # audit, sanitizeHtml, loginThrottle, memoCache,
│       │                     # emailTemplate, embedding, logger, response, …
│       ├── scheduler.js      # in-process cron (single-instance deployments only)
│       └── server.js         # graceful shutdown, timeouts, connect retry
├── deploy/
│   ├── README.md             # deployment guide, rate-limit + pool rationale
│   └── gcp/                  # Cloud Run adapter: service.yaml, cloudbuild.yaml,
│                             # scheduler-jobs.sh
└── frontend/                 # React app
    ├── public/
    └── src/
        ├── components/       # layout, ui (SmartImage, Reveal, …), CommandPalette, SecuritySettings
        ├── context/          # AuthContext (cookie), ThemeContext
        ├── lib/              # api.ts, cache.ts (SWR), sanitize.ts, highlighter.ts, mermaid.ts
        ├── pages/            # Home, Articles, ArticleDetail, WriteArticle, Profile,
        │                     # Login, Admin, Author, About, Contact, NotFound
        └── utils/
```

## Getting Started

### Prerequisites
- Node.js 22+
- PostgreSQL database
- Google Cloud Storage bucket for media uploads
- Optional: SMTP credentials (emails), `GEMINI_API_KEY` (embedding-based related posts)

### Backend
```bash
cd backend
cp .env.example .env   # fill in your values — JWT_SECRET needs 32+ chars in production
npm install
npx prisma migrate dev
npm run seed           # creates admin (only if ADMIN_EMAIL/ADMIN_PASSWORD set)
npm run dev            # runs on :5000
npm test               # security suite: access control, CSRF, throttling, headers
```

`npm test` runs against a real database, so point `DATABASE_URL` at a scratch one.
It cleans up only the rows it creates.

### Frontend
```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:5000/api
npm install
npm run dev            # runs on :3000
npm run lint           # tsc --noEmit
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

# GCS media storage (uploads)
MEDIA_STORAGE_PROVIDER=gcs
GCS_MEDIA_BUCKET=scriptory-media-506807

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
EMBEDDING_MODEL=gemini-embedding-2
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
| POST | `/api/upload/{cover,inline,video,avatar}` | Admin/User | GCS-backed media uploads (inline: images, GIF, WebM ≤10MB) |
| GET | `/api/media/:token` | — | Read private bucket media through the API |
| GET | `/rss.xml` · `/sitemap.xml` · `/robots.txt` · `/og/:slug.png` | — | Feeds + OG images (served at root) |

See `backend/README.md` for the full reference.

## Deployment

The API ships as a plain OCI container (`backend/Dockerfile`) with provider details isolated behind small adapters. Host-specific details arrive as environment
variables and are normalised by `src/config/platform.js`, so moving between
providers means writing a manifest — not touching `src/`.

**[`deploy/README.md`](deploy/README.md)** is the full guide: provisioning,
secrets, the rate-limit and connection-pool rationale, and operational notes.
`deploy/gcp/` is a worked Cloud Run + Cloud SQL adapter.

```bash
# Backend (any container host)
docker build -t scriptory-api backend/

# Frontend (any static host)
cd frontend && VITE_API_URL="https://api.example.com/api" npm run build
```

A few things that matter wherever you deploy:

- **Migrations run as a deploy step**, never at container startup — otherwise
  every instance in a scale-out races to migrate the same database.
- **`MAX_INSTANCES` is a security setting.** Rate limits are in-process, so the
  effective global ceiling is roughly the configured limit times this number.
  Keep it equal to the platform's max-instances. Credential brute force is the
  exception: that lockout lives in the database and is genuinely global.
- **`TRUST_PROXY_HOPS` must match reality** (1 behind Cloud Run, 2 with a load
  balancer in front). Too high lets clients forge `X-Forwarded-For` and evade
  every limit; too low keys the whole world on one bucket.
- **Set `SCHEDULER_MODE=external`** on any autoscaled deployment and drive
  `/internal/tasks/*` from a platform scheduler. In-process cron either never
  fires (scaled to zero) or fires once per instance — which for the newsletter
  digest means one duplicate email per instance, per subscriber.
- **`DB_POOL_MAX × MAX_INSTANCES` must stay under the database's
  `max_connections`.** Exceeding it fails every instance at once.
- If the frontend and API are on **different sites**, set `COOKIE_SAMESITE=none`
  (HTTPS required). That removes the browser's implicit CSRF protection; the
  Origin check in `csrf.middleware.js` is what replaces it.

`sharp` needs a compatible host; the provided Alpine image resolves the musl
build automatically.

## License

MIT

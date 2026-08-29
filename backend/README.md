# Scriptory — Backend

Express + Prisma REST API for the Scriptory blogging platform.

## Tech Stack

- Node.js, Express
- Prisma ORM + PostgreSQL
- Cookie-based JWT auth (bcryptjs + jsonwebtoken + cookie-parser)
- TOTP two-factor auth (otplib + qrcode)
- Nodemailer (SMTP email — contact replies, welcome, weekly digest)
- Google Cloud Storage media uploads via `@google-cloud/storage` and ADC
- sharp (auto-generated OG preview images)
- node-cron (draft auto-publish + weekly digest)
- @google/genai (content-embedding "related posts", optional)
- Joi (request validation)
- Helmet, CORS, express-rate-limit (security)
- Winston + Morgan (logging)

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma        # Data models
│   ├── migrations/          # Migration history
│   └── seed.js              # Admin seed (from env; skipped if unset)
├── src/
│   ├── config/
│   │   ├── db.js            # Prisma client singleton
│   │   ├── mailer.js        # Nodemailer transport (no-ops if SMTP unset)
│   │   └── env.js           # Validated env variables
│   ├── middleware/
│   │   ├── auth.middleware.js         # Reads cookie (or Bearer) → verifies JWT + tokenVersion
│   │   ├── optionalAuth.middleware.js # Attaches user if a valid session is present
│   │   ├── admin.middleware.js        # Role guard (ADMIN only)
│   │   └── error.middleware.js        # Centralised error handler
│   ├── modules/
│   │   ├── auth/            # register, login (+2FA), logout, change-password, 2FA setup/enable/disable
│   │   ├── article/         # CRUD, FTS, slug lookup, scheduling, related (embeddings), audited
│   │   ├── comment/         # Nested under articles, owner/admin delete
│   │   ├── like/            # Toggle like, status
│   │   ├── bookmark/        # Save / status (article-scoped) + saved list
│   │   ├── tag/             # List tags
│   │   ├── upload/          # Cover, inline, avatar upload endpoints
│   │   ├── user/            # Get me, update profile
│   │   ├── view/            # Unique view tracking
│   │   ├── contact/         # Submit (public) + list/handle/delete (admin)
│   │   ├── newsletter/      # Subscribe / two-step unsubscribe + list/delete + digest (admin)
│   │   ├── analytics/       # Admin dashboard overview
│   │   ├── stats/           # Public totals (homepage strip)
│   │   ├── audit/           # Admin audit-log list
│   │   ├── feed/            # /rss.xml, /sitemap.xml, /robots.txt (root-mounted)
│   │   ├── storage/         # Provider-neutral media service + GCS provider
│   │   └── og/              # /og/:slug.png branded preview images (sharp)
│   ├── utils/
│   │   ├── audit.js         # logAudit() + listAudit()
│   │   ├── embedding.js     # Gemini embeddings + cosine similarity (no-ops without key)
│   │   ├── emailTemplate.js # Branded, client-safe HTML email shell
│   │   ├── logger.js  readingTime.js  response.js  slugify.js
│   ├── scheduler.js         # node-cron: draft auto-publish (every min) + weekly digest (opt-in)
│   ├── app.js               # Express app setup, routes, middleware
│   └── server.js            # HTTP server entry point (starts scheduler)
```

## Getting Started

```bash
cd backend
cp .env.example .env    # fill in your values
npm install
npx prisma migrate dev  # create tables
npm run seed            # create admin (only if ADMIN_EMAIL/ADMIN_PASSWORD set)
npm run dev             # runs on :5000
```

## Environment Variables

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scriptory
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1d
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:5000            # public URL of this API (email links)

# Auth cookie
COOKIE_SAMESITE=lax                      # "none" (+HTTPS) if frontend/API cross-site
# COOKIE_DOMAIN=.yourdomain.com
TWO_FACTOR_ISSUER=Scriptory

# Admin seed — blank = skip seeding
ADMIN_EMAIL=
ADMIN_PASSWORD=

# Media storage
MEDIA_STORAGE_PROVIDER=gcs
GCS_MEDIA_BUCKET=scriptory-media-506807

# SMTP (optional — if unset, emails are logged & skipped; data still persists)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false                        # true for port 465
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Scriptory <no-reply@scriptory.com>
CONTACT_RECIPIENT=                       # defaults to ADMIN_EMAIL

# Newsletter digest cron (opt-in — sends real email). Off by default.
NEWSLETTER_DIGEST_ENABLED=false
NEWSLETTER_DIGEST_CRON=0 9 * * 1         # node-cron expression (Mondays 09:00)

# Related posts via Gemini embeddings (optional; falls back to shared tags without a key)
GEMINI_API_KEY=
EMBEDDING_MODEL=text-embedding-004
```

> **Note:** `ADMIN_EMAIL` / `ADMIN_PASSWORD` are only used the **first time** the admin is seeded. Editing them later does **not** change the existing admin's password — use the in-app *Change password*, or reset it directly in the DB / via a one-off script.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start production server |
| `npm run prisma:migrate` | Create and apply a new migration |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run seed` | Seed admin user from env credentials |

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register; sets httpOnly session cookie |
| POST | `/api/auth/login` | — | Login with `email`, `password`, optional `totp`. Returns `401 { twoFactorRequired: true }` if 2FA is on and no code supplied |
| POST | `/api/auth/logout` | — | Clears the session cookie |
| POST | `/api/auth/change-password` | User | Change password; re-issues this session, revokes others |
| POST | `/api/auth/2fa/setup` | User | Returns QR data-URL + secret (pending) |
| POST | `/api/auth/2fa/enable` | User | Verify code, enable 2FA |
| POST | `/api/auth/2fa/disable` | User | Verify code, disable 2FA |

Sessions are carried by an **httpOnly cookie**; a `Bearer` header is also accepted for tooling. The JWT embeds `tokenVersion`, checked on every request so password/2FA changes revoke old sessions.

### Articles
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/articles` | — | List (paginated). `search` uses Postgres **full-text search** (title+excerpt+content, ranked); filter by `tag`. Lean payload |
| GET | `/api/articles/:slug` | — | Single article by slug (includes `comments`, `series`, `publishAt`) |
| GET | `/api/articles/:slug/related` | — | Related posts by embedding similarity → shared-tag fallback |
| POST | `/api/articles` | Admin | Create — accepts `series`, `seriesOrder`, `publishAt` (future = scheduled draft). Audited |
| PUT | `/api/articles/:uuid` | Admin | Update (audited) |
| DELETE | `/api/articles/:uuid` | Admin | Delete (audited) |

### Likes / Views / Comments / Bookmarks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/articles/:slug/likes` | Optional/User | Like status / toggle |
| POST | `/api/articles/:slug/views` | Optional | Increment unique view |
| GET/POST/DELETE | `/api/articles/:slug/comments[/:uuid]` | —/User/Owner-Admin | List / post / delete |
| GET/POST | `/api/articles/:slug/bookmark` | User | Bookmark status / toggle |
| GET | `/api/bookmarks` | User | Current user's saved articles |

### Contact
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/contact` | — | Submit (persisted; emails owner + auto-reply). Honeypot + rate limited |
| GET | `/api/contact` | Admin | List messages |
| PATCH | `/api/contact/:uuid` | Admin | Set `{ handled: boolean }` |
| DELETE | `/api/contact/:uuid` | Admin | Delete message |

### Newsletter
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/newsletter/subscribe` | — | Subscribe (persisted + welcome email) |
| GET | `/api/newsletter/unsubscribe?token=` | — | Confirmation page (no state change) |
| POST | `/api/newsletter/unsubscribe` | — | Perform unsubscribe |
| GET | `/api/newsletter/subscribers` | Admin | List subscribers |
| DELETE | `/api/newsletter/subscribers/:uuid` | Admin | Delete subscriber |
| POST | `/api/newsletter/digest` | Admin | Send the recent-posts digest to all active subscribers |

### Users / Upload / Tags / Admin data
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/PATCH | `/api/users/me` · `me/profile` | User | Current user (incl. `twoFactorEnabled`) / update profile |
| POST | `/api/upload/{cover,inline,video,avatar}` | Admin/User | GCS-backed media uploads |
| GET | `/api/media/:token` | — | Stream private bucket media through the API |
| GET | `/api/tags` | — | List all tags |
| GET | `/api/stats` | — | Public totals (articles / views / topics) |
| GET | `/api/analytics` | Admin | Dashboard: totals, 30-day views, top posts |
| GET | `/api/audit` | Admin | Recent security/admin activity |

### Feeds & OG images (served at the root, not under `/api`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/rss.xml` | — | RSS 2.0 feed of published posts |
| GET | `/sitemap.xml` | — | XML sitemap |
| GET | `/robots.txt` | — | Robots + sitemap pointer |
| GET | `/og/:slug.png` | — | Auto-generated 1200×630 branded OG image (sharp) |

## Scheduled Jobs (`scheduler.js`, node-cron)

- **Draft auto-publish** — every minute, flips `published=true` on drafts whose `publishAt` has passed.
- **Newsletter digest** — opt-in (`NEWSLETTER_DIGEST_ENABLED=true`); emails recent posts to active subscribers on the `NEWSLETTER_DIGEST_CRON` schedule.

Jobs run **in-process** on the event loop (non-blocking, async I/O). Run a **single instance** (or a dedicated worker) in production to avoid duplicate digest sends.

## Data Models

```
User         — uuid, email, password, role (ADMIN|USER),
               tokenVersion, twoFactorEnabled, twoFactorSecret, twoFactorPending
Profile      — userId, name, bio, avatarUrl
Article      — uuid, title, subtitle, slug, content, contentSource, contentFormat,
               contentVersion, coverImage, published, readingTime, publishAt,
               embedding (Json, related-posts), seriesId, seriesOrder
Series       — uuid, title, slug, description  →  has many Article
Tag          — name (unique)   ·   TagOnArticle — articleId ↔ tagId
Comment      — uuid, content, userId, articleId
Like         — userId, articleId (unique pair)
Bookmark     — userId, articleId (unique pair)
View         — articleId (aggregate)   ·   ViewRecord — articleId, fingerprint (unique per viewer)
ContactMessage — uuid, name, email, message, ipHash, userAgent, handled
Subscriber   — uuid, email (unique), status, unsubscribeToken
AuditLog     — uuid, action, actorEmail, actorUuid, ip, detail, createdAt
```

## Security

- **httpOnly cookie sessions** — JWT not readable by JS; `SameSite=Lax`, `Secure` in production
- **Token revocation** via `User.tokenVersion` embedded in the JWT (logout-everywhere on password/2FA change)
- **TOTP 2FA** for accounts (otplib); secret stored server-side only
- **Constant-time login** (bcrypt always runs) → no user enumeration
- Password policy: min 8, letter + number (Joi); seed warns on weak `ADMIN_PASSWORD`
- Helmet security headers; CORS restricted to `FRONTEND_URL` with credentials
- Rate limiting: global on `/api`, tighter on `/auth` and public write endpoints (contact/subscribe, POST-only)
- Passwords hashed with bcrypt (cost 12); `uuid` used as the external identifier
- Email header-injection & HTML escaping on all user input; CSV-injection guard on exports
- **Audit log** of auth events and article mutations

## Response Format

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "...", "errors": [...] }
```

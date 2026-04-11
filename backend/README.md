# Scriptory — Backend

Express + Prisma REST API for the Scriptory blogging platform.

## Tech Stack

- Node.js, Express
- Prisma ORM + PostgreSQL
- JWT authentication (bcryptjs + jsonwebtoken)
- Cloudinary (image uploads via multer-storage-cloudinary)
- Joi (request validation)
- Helmet, CORS, express-rate-limit (security)
- Winston + Morgan (logging)

## Project Structure

```
backend/
├── prisma/
│   ├── schema.prisma        # Data models
│   ├── migrations/          # Migration history
│   └── seed.js              # Admin user seed
├── src/
│   ├── config/
│   │   ├── db.js            # Prisma client singleton
│   │   ├── cloudinary.js    # Multer + Cloudinary storage configs
│   │   └── env.js           # Validated env variables
│   ├── middleware/
│   │   ├── auth.middleware.js        # JWT verification → req.user
│   │   ├── optionalAuth.middleware.js # Attaches user if token present
│   │   ├── admin.middleware.js       # Role guard (ADMIN only)
│   │   └── error.middleware.js       # Centralised error handler
│   ├── modules/
│   │   ├── auth/            # register, login
│   │   ├── article/         # CRUD, slug-based lookup, uuid-based mutations
│   │   ├── comment/         # Nested under articles, owner/admin delete
│   │   ├── like/            # Toggle like, status
│   │   ├── tag/             # List tags
│   │   ├── upload/          # Cover, inline, avatar upload to Cloudinary
│   │   ├── user/            # Get me, update profile
│   │   └── view/            # Unique view tracking
│   ├── utils/
│   │   ├── logger.js        # Winston logger
│   │   ├── readingTime.js   # Word count → minutes
│   │   ├── response.js      # sendSuccess / sendError helpers
│   │   └── slugify.js       # Title → URL slug
│   ├── app.js               # Express app setup, routes, middleware
│   └── server.js            # HTTP server entry point
```

## Getting Started

```bash
cd backend
cp .env.example .env    # fill in your values
npm install
npx prisma migrate dev  # create tables
npm run seed            # create admin user
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
ADMIN_EMAIL=admin@scriptory.com
ADMIN_PASSWORD=Admin@123456
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start with nodemon (hot reload) |
| `npm start` | Start production build |
| `npm run prisma:migrate` | Create and apply a new migration |
| `npm run prisma:deploy` | Apply migrations in production |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npm run seed` | Seed admin user from env credentials |

## API Reference

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register new user |
| POST | `/api/auth/login` | — | Login, returns JWT |

### Articles
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/articles` | — | List articles (paginated, filterable by tag/search) |
| GET | `/api/articles/:slug` | — | Get single article by slug |
| POST | `/api/articles` | Admin | Create article |
| PUT | `/api/articles/:uuid` | Admin | Update article |
| DELETE | `/api/articles/:uuid` | Admin | Delete article |

### Likes
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/articles/:slug/likes` | Optional | Get like count + liked status |
| POST | `/api/articles/:slug/likes` | User | Toggle like |

### Views
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/articles/:slug/views` | Optional | Increment unique view count |

### Comments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/articles/:slug/comments` | — | List comments |
| POST | `/api/articles/:slug/comments` | User | Post comment |
| DELETE | `/api/articles/:slug/comments/:uuid` | Owner/Admin | Delete comment |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | User | Get current user + profile |
| PATCH | `/api/users/me/profile` | User | Update name, bio, avatarUrl |

### Upload
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/upload/cover` | Admin | Upload article cover (1200×630, Cloudinary) |
| POST | `/api/upload/inline` | Admin | Upload inline article image |
| POST | `/api/upload/avatar` | User | Upload profile avatar (200×200, face crop) |

### Tags
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tags` | — | List all tags |

## Data Models

```
User        — id, uuid, email, password, role (ADMIN|USER)
Profile     — userId, name, bio, avatarUrl
Article     — uuid, title, subtitle, slug, content, coverImage, published, readingTime
Tag         — name (unique)
TagOnArticle — articleId ↔ tagId
Comment     — uuid, content, userId, articleId
Like        — userId, articleId (unique pair)
View        — articleId (aggregate count)
ViewRecord  — articleId, fingerprint (unique per viewer per article)
```

## Security

- Helmet sets secure HTTP headers
- CORS restricted to `FRONTEND_URL`
- Rate limiting: 100 req/15min globally, 10 req/15min on auth routes (production)
- Passwords hashed with bcrypt (12 rounds)
- JWT signed with `userUuid` payload — no numeric IDs exposed externally
- All DB mutations use `uuid` as the external identifier

## Response Format

All responses follow a consistent shape:

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "...", "errors": [...] }
```

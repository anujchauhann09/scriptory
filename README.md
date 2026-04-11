# Scriptory

A full-stack blogging platform built with React + Node.js. Clean reading experience, admin-managed content, and a REST API backend with PostgreSQL.

## Tech Stack

**Frontend** — React (Vite), TypeScript, Tailwind CSS, Framer Motion, React Router, React Helmet Async

**Backend** — Node.js, Express, Prisma ORM, PostgreSQL, JWT auth, Cloudinary (image uploads), Winston logging

## Features

- JWT authentication (register / login)
- Role-based access — Admin can write, edit, delete articles
- Article CRUD with markdown editor, cover image, tags, excerpt
- Unique view tracking (per user / anonymous fingerprint)
- Like / unlike articles (logged-in users)
- Comments — post (any user), delete (owner or admin)
- User profile — name, bio, avatar upload to Cloudinary
- Tag filtering and search on article listing
- Reading progress bar, share buttons, related articles
- Auto reading time calculation
- Dark / light mode
- SEO with dynamic meta tags
- Contact form via EmailJS

## Project Structure

```
scriptory/
├── backend/                  # Express API
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── src/
│       ├── config/           # db, cloudinary, env
│       ├── middleware/       # auth, admin, error, optionalAuth
│       ├── modules/
│       │   ├── auth/
│       │   ├── article/
│       │   ├── comment/
│       │   ├── like/
│       │   ├── tag/
│       │   ├── upload/
│       │   ├── user/
│       │   └── view/
│       └── utils/
└── frontend/                 # React app
    ├── public/
    └── src/
        ├── components/
        │   ├── layout/       # Navbar, Footer, LayoutWrapper
        │   └── ui/           # Button, Input, Badge, ImageUpload, Skeleton, etc.
        ├── context/          # AuthContext, ThemeContext
        ├── lib/              # api.ts — central fetch client
        ├── pages/            # Home, Articles, ArticleDetail, WriteArticle, Profile, etc.
        └── utils/
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Cloudinary account

### Backend

```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npx prisma migrate dev
npm run seed           # creates admin user
npm run dev            # runs on :5000
```

**Backend `.env` variables:**

```env
DATABASE_URL=postgresql://user:password@localhost:5432/scriptory
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
FRONTEND_URL=http://localhost:3000
PORT=5000
NODE_ENV=development
ADMIN_EMAIL=admin@scriptory.com
ADMIN_PASSWORD=Admin@123456
```

### Frontend

```bash
cd frontend
cp .env.example .env   # or create manually
npm install
npm run dev               # runs on :3000
```

**Frontend `.env` variables:**

```env
VITE_API_URL=http://localhost:5000/api
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_TEMPLATE_ID=
VITE_EMAILJS_CONTACT_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
```

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register |
| POST | `/api/auth/login` | — | Login |
| GET | `/api/articles` | — | List articles |
| GET | `/api/articles/:slug` | — | Get article |
| POST | `/api/articles` | Admin | Create article |
| PUT | `/api/articles/:uuid` | Admin | Update article |
| DELETE | `/api/articles/:uuid` | Admin | Delete article |
| GET | `/api/articles/:slug/likes` | Optional | Like status |
| POST | `/api/articles/:slug/likes` | User | Toggle like |
| POST | `/api/articles/:slug/views` | Optional | Increment view |
| GET | `/api/articles/:slug/comments` | — | List comments |
| POST | `/api/articles/:slug/comments` | User | Post comment |
| DELETE | `/api/articles/:slug/comments/:uuid` | Owner/Admin | Delete comment |
| GET | `/api/users/me` | User | Get profile |
| PATCH | `/api/users/me/profile` | User | Update profile |
| POST | `/api/upload/cover` | Admin | Upload cover image |
| POST | `/api/upload/inline` | Admin | Upload inline image |
| POST | `/api/upload/avatar` | User | Upload avatar |
| GET | `/api/tags` | — | List tags |

## Deployment

**Backend** — any Node.js host (Railway, Render, Fly.io). Run `npx prisma migrate deploy` on first deploy.

**Frontend** — Vercel or Netlify. Set `VITE_API_URL` to your deployed backend URL. The included `vercel.json` handles SPA routing.

## License

MIT

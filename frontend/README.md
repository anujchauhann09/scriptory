# Scriptory — Frontend

React + TypeScript frontend for the Scriptory blogging platform. Connects to the Express/Prisma backend API.

## Tech Stack

- React 18, TypeScript, Vite
- Tailwind CSS v4 + `@tailwindcss/typography`
- Framer Motion (`motion`)
- React Router DOM v7
- Lucide React (icons)
- React Helmet Async (SEO)
- EmailJS (contact form + newsletter)

## Project Structure

```
frontend/
├── public/              # Static assets (images, favicon)
├── src/
│   ├── components/
│   │   ├── layout/      # Navbar, Footer, LayoutWrapper
│   │   └── ui/          # Button, Input, Badge, Container, Section,
│   │                    # ImageUpload, ArticleCard, Skeleton
│   ├── context/
│   │   ├── AuthContext.tsx   # JWT auth state, login/register/logout
│   │   └── ThemeContext.tsx  # Dark/light mode
│   ├── lib/
│   │   └── api.ts       # Central fetch client — all API calls
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Articles.tsx
│   │   ├── ArticleDetail.tsx
│   │   ├── WriteArticle.tsx
│   │   ├── Profile.tsx
│   │   ├── Login.tsx
│   │   ├── About.tsx
│   │   ├── Contact.tsx
│   │   └── NotFound.tsx
│   ├── utils/
│   │   └── cn.ts        # Tailwind class merge utility
│   ├── App.tsx          # Routes + protected route guards
│   ├── main.tsx
│   └── index.css        # Global styles, CSS variables, prose overrides
└── index.html
```

## Pages & Features

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Hero, featured article, recent articles grid |
| Articles | `/articles` | Paginated list with tag filter + search |
| Article Detail | `/articles/:slug` | Full article, reading progress bar, share buttons, related articles, likes, comments |
| Write / Edit | `/write` | Markdown editor with toolbar, cover image upload, tags, draft toggle (admin only) |
| Profile | `/profile` | Edit name, bio, avatar upload to Cloudinary |
| Login | `/login` | Sign in / register form |
| About | `/about` | Author bio |
| Contact | `/contact` | EmailJS contact form |

## Getting Started

```bash
cd frontend
cp .env.example .env   # or create .env manually
npm install
npm run dev               # runs on :3000
```

## Environment Variables

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_EMAILJS_SERVICE_ID=
VITE_EMAILJS_TEMPLATE_ID=
VITE_EMAILJS_CONTACT_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
```

`VITE_API_URL` must point to the running backend. EmailJS keys are only needed for the contact form and newsletter — the app works without them.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | TypeScript type check |

## Auth & Roles

Auth state lives in `AuthContext`. On login/register the JWT and user object are stored in `localStorage` under the `auth` key. Two roles exist:

- `USER` — can like articles, post/delete own comments, edit profile
- `ADMIN` — all of the above plus write/edit/delete articles, delete any comment

Protected routes use `<AdminRoute>` (admin only) and `<ProtectedRoute>` (any logged-in user).

## API Client

All backend calls go through `src/lib/api.ts`. It reads the token from `localStorage` and attaches it as a `Bearer` header automatically. Exports:

- `articlesApi` — list, get, create, update, delete, incrementView
- `commentsApi` — list, create, delete
- `likesApi` — status, toggle
- `tagsApi` — list
- `uploadApi` — cover, inline, avatar (multipart)
- `userApi` — me, updateProfile

## Deployment

Build with `npm run build` and deploy the `dist/` folder to Vercel, Netlify, or any static host. Set `VITE_API_URL` to your deployed backend URL in the host's environment variable settings.

For Vercel, the included `vercel.json` handles SPA routing rewrites.

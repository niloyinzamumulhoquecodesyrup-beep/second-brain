# Second Brain - Minimal Next.js app

This repository contains a minimal Next.js "Second Brain" web app (Capture / Organize (PARA) / Distill / Express) backed by Postgres.

Important security note
- Do NOT commit your real DATABASE_URL or password into the repository. Use `.env.local` (which is gitignored) with the real value.

Quick start
1. npm install
2. Create a file `.env.local` and set:

   DATABASE_URL=postgresql://postgres:<YOUR_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres

3. Run the migration SQL to create tables:

   psql "$DATABASE_URL" -f migrations/001_init.sql

   (If you are using Supabase, you can also run the SQL in the Supabase SQL editor.)

4. npm run dev
5. Open http://localhost:3000

Notes on deployment
- You requested GitHub Pages. GitHub Pages serves static sites and won't host a server-rendered Next.js app with API routes and a Postgres connection.
- Recommended: deploy to Vercel (supports Next.js) or Netlify / Render. The README includes simple Vercel instructions.
- If you truly need GitHub Pages, we can add a static export (`next export`) and publish the generated static files to the `gh-pages` branch or `docs/` folder. This is a read-only frontend; API routes and DB functionality will not work on GitHub Pages.

What's included
- pages/: simple pages for capture, organize (PARA), distill, express
- pages/api/: API routes for notes, PARA moves, and packets
- lib/db.js: pg Pool wrapper using DATABASE_URL
- migrations/001_init.sql: create tables

If you want, I can push the static export to the `gh-pages` branch after you confirm you accept the reduced static-only limitations for GitHub Pages.

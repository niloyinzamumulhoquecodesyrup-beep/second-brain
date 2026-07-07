# Second Brain

A private, single-user "second brain" web app built around the CODE method (Capture / Organize / Distill /
Express) and the PARA system (Projects / Areas / Resources / Archives). Next.js (pages router) + Postgres
(Supabase), with a password-protected login gating every page and API route.

## Features

- **Capture** — quick-add notes with tags, a PARA bucket, and an optional source URL. Reference other notes
  inline with `[[Note Title]]`.
- **Organize** — a PARA board (Projects / Areas / Resources / Archives) with search and tag filtering.
- **Distill** — write an executive summary for any note; tracks which notes are "distilled".
- **Express** — turn notes into intermediate packets (small, checkable next actions) and mark projects complete.
- **Connections** — `[[Title]]` references are parsed automatically into a `note_links` table, powering
  backlinks ("Linked from") on every note's detail page.
- **Auth** — a single account, seeded directly into Postgres (bcrypt-hashed password). Sessions are signed JWTs
  in an httpOnly cookie. Every page uses `getServerSideProps` to redirect to `/login` if there's no valid
  session; every API route uses the same check server-side.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — your Postgres connection string (Supabase pooler works well)
   - `SESSION_SECRET` — a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `SEED_EMAIL` / `SEED_PASSWORD` — only needed to run the seed script below
3. Create the schema: `npm run migrate`
4. Create your account: `npm run seed:user` (reads `SEED_EMAIL` / `SEED_PASSWORD` from `.env.local`, upserts a
   bcrypt-hashed row into `users`). Re-run any time to rotate your password.
5. `npm run dev` and open http://localhost:3000 — you'll land on `/login`.

## Deployment

This app needs a Node.js server (API routes + SSR), so it won't run on GitHub Pages. Vercel is the simplest
target — set the same three env vars (`DATABASE_URL`, `SESSION_SECRET`, plus run `seed:user` once locally
against the prod database) in the project settings.

## Security notes

- Never commit `.env.local` — it holds your live database credentials and session secret.
- The login endpoint rate-limits repeated failed attempts per IP (10 per 15 minutes).
- All pages set `noindex, nofollow` and the app sends baseline security headers (`X-Frame-Options`,
  `X-Content-Type-Options`, etc.) via `next.config.js`.
- To change your password later, update `SEED_PASSWORD` in `.env.local` and re-run `npm run seed:user`.

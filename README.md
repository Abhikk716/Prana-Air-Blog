# Prana Air Blog

Headless blog CMS for Prana Air: Next.js (App Router) + MongoDB via Mongoose. It hosts the admin
dashboard/editor and exposes a public JSON API that the main `pranaair.com` website consumes.

## Stack
- **Database:** MongoDB (Mongoose)
- **Backend/APIs:** Next.js Route Handlers (`/api/...`)
- **Editor:** TinyMCE (loaded from cdnjs)
- **Image storage:** local `public/uploads/` and `public/wp-content/uploads/` by default, or Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set

## Commands
```bash
npm run dev      # next dev on :3000
npm run build
npm start
node scripts/wp-import.js --list         # show WordPress posts not yet migrated
node scripts/db-migrate.js export        # dump the DB to db-backup/
node scripts/backfill-seo-scores.js      # backfill missing SEO/readability scores
```

See `CLAUDE.md` for the full architecture notes.

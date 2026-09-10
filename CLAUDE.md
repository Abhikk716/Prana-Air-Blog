# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A headless blog CMS for Prana Air: Next.js 16 (App Router, plain JavaScript, no TypeScript, no ESLint/Prettier config) + MongoDB via Mongoose. It hosts the admin dashboard/editor and exposes a public JSON API that the main `pranaair.com` website consumes. The `/test-blog/[slug]` page is a preview renderer, not the production reader — canonical URLs point at `https://www.pranaair.com/blog/<slug>`.

The README is stale: it mentions TipTap/Quill and a WordPress migration utility. The actual editor is TinyMCE (loaded from cdnjs, no API key) and there is no migration script in the repo; only leftover `/wp-content/uploads` path-rewriting remains.

## Commands

```bash
npm run dev      # next dev on :3000
npm run build
npm start
cd scripts && node reset-views.js   # zero all view counters (must run from scripts/ — dotenv path is ../.env)
node scripts/backfill-seo-scores.js [--force]   # store seo.score/readability/grade on posts lacking them (any cwd; does not bump updatedAt)
```

There are no tests and no lint script. `npm test` exits 1 by design.

Note on `reset-views.js`: it requires `lib/db` before `dotenv.config()` runs, so `MONGODB_URI` must already be in the shell env or it silently connects to `mongodb://localhost:27017/pranaair-blog`.

## Environment (.env, gitignored)

Required: `MONGODB_URI`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CLAUDE_API_KEY` (translation + SEO features).
Optional: `BLOB_READ_WRITE_TOKEN` (switches uploads from `public/uploads/content/` to Vercel Blob), `NEXT_PUBLIC_SITE_URL` (canonical/OG domain, defaults to pranaair.com), `WP_API_URL` (WordPress REST base, defaults to `https://www.pranaair.com/blog/wp-json/wp/v2`; used only by `GET /api/admin/media-alt` to recover a migrated image's original alt text from the media library).

## Architecture

### Auth
Single admin account from env vars. `POST /api/admin/login` sets an `admin_session` cookie containing an HMAC-signed expiry token (`lib/sessionToken.js`); there is no user table. Every admin-only route and server page calls `isAdminAuthenticated()` from `lib/adminAuth.js` — use it for any new protected route. Login has in-memory per-IP lockout (5 tries / 15 min); note that in-memory maps (also used for view-tracking rate limits) reset on each serverless cold start.

`/` redirects to the dashboard or login; there is no public homepage in this app.

### Data model (`models/`)
- `Post` — the core document. `content` is raw HTML from TinyMCE. `seo.score`, `seo.readability`, `seo.grade` are denormalized audit results written by the editor on every save (and by the backfill script); the dashboard reads them instead of loading bodies, and computes them live only for posts that have none. `seo.primaryKeyword` is the target keyword (it was silently dropped before it was added to the schema). `translations` is a `Map<langCode, {title, content, excerpt, seo}>`. Crucially, the editor stores **English regional variants** (`in`, `us`, `en-GB`, `en-CA`, `en-AU`, `sg`) in the same map as real translations (`hi es de fr ru ja pt-PT`), so posts are large. Never fetch full posts for list views — see the dashboard's `$project` aggregation for the pattern.
- `BannerSettings` — promotional banners, `type: 'global' | 'category'`.
- `DailyAnalytics` — per-post, per-day view counts (unique index on `postId+date`), written alongside the running totals in `Post.analytics`.

Models use `delete mongoose.models.X` before `mongoose.model()` to survive Next dev hot reloads. `lib/db.js` caches the connection on `global.mongoose`. Models and `lib/db.js` are CommonJS (`require`/`module.exports`) while routes/components are ESM; both import styles work in Next but keep the existing style per file.

### SEO scoring (`lib/seoAnalysis.js`)
CommonJS, no React. `analyzeReadabilityAndSeo()` is the single audit used by the editor's live panel, Auto-Fix All, the dashboard server page and the backfill script — change thresholds or issue codes there only. `scorePost(post, existingPosts)` maps a Post to the stored `seo.*` score fields, and `refreshStoredScores(Post, doc)` recomputes and writes them; `POST /api/posts` and `PUT /api/posts/[id]` call it after every save, so the server is the source of truth for scores (the editor's own copy is just a preview). Import it with a default import and destructure (`import seoAnalysis from ...; const { x } = seoAnalysis`) so it works in both server and client components.

### Language handling
Every read path (`GET /api/posts`, `GET /api/posts/[id]`, `test-blog/[slug]/page.js`) accepts `?lang=` and runs a locally duplicated `translatePost()` that overlays the translation's title/content/excerpt/seo onto the base post. If you change translation shape, update all three copies.

### Promotion/banner resolution
Duplicated in `GET /api/posts/[id]` and `test-blog/[slug]/page.js`: post-level promotion (if active and not expired) → category banners matching any of the post's categories → global banner. Result is exposed as `post.promotions[]` with a `placement` of `sidebar | post_top | post_bottom`.

### Public API (CORS `*`)
`GET /api/posts`, `GET /api/posts/[id]` (accepts ObjectId or slug), `GET /api/posts/meta` (sidebar data), `POST /api/analytics/track` (`{slug, action: 'view'|'promotion_click', lang}`). These are consumed by the external website; changing response shapes is a breaking change for it.

### Admin UI
- `app/admin/dashboard/` — server page does auth + slim aggregation (pulls `content` only for never-scored posts via a `$cond`/`$$REMOVE` projection, scores them, then drops it), hands off to `DashboardClient.js` (tabs: `posts`, `analytics` with Recharts, `banners`; tab selected via `?tab=`). The posts tab has multi-select with a bulk bar backed by `POST /api/admin/posts/bulk` (`{ action: 'delete'|'publish'|'draft', ids }`), thumbnails, and SEO/readability score columns.
- `app/admin/editor/page.js` (~3k lines, single client component) — TinyMCE editor with per-language tabs, translation orchestration, SEO scoring, and readability metrics computed client-side. Loads `?id=` to edit. TinyMCE `Custom Designs`/`Templates` menus insert marked-up blocks (`.prana-gallery-box`, `.prana-faq-block`) that `components/blog/RichContent.js` later hydrates into Swiper carousels and toggles on the reader side.
- `AppShell.js` hides header/footer on `/admin/login` and widens layout on `/admin/editor`.

### AI features (Anthropic SDK, model `claude-haiku-4-5-20251001`)
- `POST /api/translate` — translates one language per request. It does **not** send HTML to the model: `lib/htmlSegments.js` extracts text nodes with cheerio, the model returns them as a single `@@SEG@@`-delimited string via forced tool use, and the text is injected back into the untouched DOM. Segments are chunked to ~3000 chars per call and each chunk retries up to 4× with rising temperature if the segment count doesn't match. The editor fans out languages through a concurrency-capped pool with 429 backoff. Keep the delimiter approach; the array-of-strings schema was abandoned because the model sometimes returned a JSON string instead of an array.
- `POST /api/ai/fix-seo` — one endpoint, dispatched on `action`. Two generations coexist:
  - **Structured (preferred):** `fix_metadata` (title+slug+description, takes `feedback[]` strings from the editor audit, verifies lengths server-side with retries and a deterministic trim) and `fix_content` (one body rewrite driven by a `directives[]` list: `keyword_body`, `destuff`, `readability`, `headings`, `eeat`, `ymyl`; sizes `max_tokens` from content length, rejects truncated or lossy rewrites). Both use forced tool-use via `callStructured()`.
  - **Legacy text-JSON:** `suggest_keyword`, `fix_title`, `fix_description`, `fix_slug`, `differentiate_cannibalization`, `fix_content_keyword`, `fix_readability`, `fix_eeat_ymyl`, `optimize_content`, `fix_all`. These ask for raw JSON and repair it with `safeExtractJson()`; still used by the per-issue buttons.
- **Auto-Fix All** in the editor (`handleAutoFixAll`) is a client-side pipeline, not a single call: suggest keyword if missing → one `fix_content` pass with only the flagged directives → `fix_metadata`, re-running `analyzeReadabilityAndSeo()` locally between rounds (max 3) and feeding remaining failures back. Every audit issue carries a stable `code`; `AUTO_FIX_META_CODES` / `AUTO_FIX_CONTENT_DIRECTIVES` decide what Claude handles and what is reported as manual (word count, featured image, canonical, cannibalization that overlaps only on the keyword itself).

### Content quirks to preserve
- Post HTML may contain legacy `/wp-content/uploads/...` image paths; `public/wp-content/uploads/` holds ~950 migrated files and the API/page rewrite these paths on read. `GET /api/posts/[id]` also wraps `<table>`s in a responsive wrapper and injects a `<style>` block at read time (not stored).
- Styling is plain global CSS (`app/globals.css`, `app/admin/editor/editor.css`, `app/test-blog/blog.css`) plus inline styles; no CSS modules or Tailwind.

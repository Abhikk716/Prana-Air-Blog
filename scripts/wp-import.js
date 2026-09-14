/**
 * Import posts from the WordPress site (WP_API_URL) into this CMS.
 * Posts are matched by slug; existing ones are skipped unless --force.
 *
 *   node scripts/wp-import.js --list                    # show WP posts not yet in our DB
 *   node scripts/wp-import.js --missing                 # import all of them
 *   node scripts/wp-import.js --slug some-post-slug     # import one (repeatable)
 *   node scripts/wp-import.js --id 139780               # import by WP post id
 *   node scripts/wp-import.js --slug x --force          # overwrite an existing post's content/meta
 *   node scripts/wp-import.js --slug x --dry-run        # show what would be written
 *
 * WP drafts / pending / scheduled posts are not visible on the public API. To pull them,
 * set WP_USER and WP_APP_PASSWORD (WordPress -> Users -> Application Passwords) in .env and
 * add --status any (or draft / pending / future).
 *
 * Images referenced from /blog/wp-content/uploads/... are downloaded into
 * public/wp-content/uploads/... (same convention as the original migration) and the HTML
 * is rewritten to the relative /wp-content/uploads/... path.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../lib/db');
const Post = require('../models/post');
const { scorePost } = require('../lib/seoAnalysis');

const WP = (process.env.WP_API_URL || 'https://www.pranaair.com/blog/wp-json/wp/v2').replace(/\/$/, '');
const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'wp-content', 'uploads');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opts = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const opt = (n) => opts(n)[0];

const authHeaders = () => {
  if (!process.env.WP_USER || !process.env.WP_APP_PASSWORD) return {};
  return { Authorization: 'Basic ' + Buffer.from(`${process.env.WP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64') };
};

async function wpGet(pathname, params = {}) {
  const url = new URL(`${WP}${pathname}`);
  Object.entries(params).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, v));
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`WP ${r.status} ${url}: ${(await r.text()).slice(0, 200)}`);
  return { data: await r.json(), totalPages: Number(r.headers.get('x-wp-totalpages') || 1) };
}

async function wpListAll(extra = {}) {
  const all = [];
  for (let page = 1; ; page++) {
    const { data, totalPages } = await wpGet('/posts', { per_page: 100, page, _fields: 'id,slug,date_gmt,modified_gmt,title,status', ...extra });
    all.push(...data);
    if (page >= totalPages || !data.length) break;
  }
  return all;
}

const NAMED = { hellip: '…', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', apos: "'" };
const decode = (s = '') =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
   .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
   .replace(/&([a-z]+);/gi, (m, name) => NAMED[name] ?? m);

const stripTags = (s = '') => decode(s.replace(/<[^>]+>/g, '')).trim();

// Matches any absolute or relative reference to the WP uploads folder, captures the path after uploads/
const UPLOAD_RE = /(?:https?:\/\/(?:www\.)?pranaair\.com)?\/blog\/wp-content\/uploads\/([^"'\s)>]+)/g;

async function downloadUpload(rel) {
  const dest = path.join(UPLOADS_DIR, ...rel.split('/'));
  if (fs.existsSync(dest)) return false;
  const r = await fetch(`https://www.pranaair.com/blog/wp-content/uploads/${rel}`);
  if (!r.ok) { console.warn(`   ! could not download ${rel} (${r.status})`); return false; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return true;
}

async function localizeImages(html, dryRun) {
  const rels = new Set([...html.matchAll(UPLOAD_RE)].map((m) => m[1]));
  let downloaded = 0;
  for (const rel of rels) if (!dryRun && (await downloadUpload(rel))) downloaded++;
  return { html: html.replace(UPLOAD_RE, '/wp-content/uploads/$1'), files: rels.size, downloaded };
}

function toPostDoc(wp, localizedContent) {
  const media = wp._embedded?.['wp:featuredmedia']?.[0];
  const terms = wp._embedded?.['wp:term'] || [];
  const categories = terms.flat().filter((t) => t.taxonomy === 'category').map((t) => decode(t.name));
  const tags = terms.flat().filter((t) => t.taxonomy === 'post_tag').map((t) => decode(t.name));
  const yoast = wp.yoast_head_json || {};
  const featuredImage = (media?.source_url || '').replace(UPLOAD_RE, '/wp-content/uploads/$1');
  const title = decode(wp.title?.rendered || '');
  return {
    title,
    slug: wp.slug,
    content: localizedContent,
    excerpt: stripTags(wp.excerpt?.rendered || '').slice(0, 300),
    featuredImage,
    featuredImageAlt: decode(media?.alt_text || ''),
    author: wp._embedded?.author?.[0]?.name || 'Admin',
    categories,
    tags,
    status: wp.status === 'publish' ? 'published' : 'draft',
    seo: {
      title: decode(yoast.title || title),
      description: decode(yoast.description || ''),
      keywords: categories,
      canonicalUrl: '',
      primaryKeyword: '',
    },
    publishedAt: wp.status === 'publish' ? new Date(wp.date_gmt + 'Z') : null,
    translations: {},
  };
}

async function importOne(wp, { force, dryRun, existingForScore }) {
  const existing = await Post.findOne({ slug: wp.slug }, '_id').lean();
  if (existing && !force) { console.log(`  skip  ${wp.slug} (already in DB, use --force to overwrite)`); return 'skipped'; }

  const full = (await wpGet(`/posts/${wp.id}`, { _embed: 1 })).data;
  const { html, files, downloaded } = await localizeImages(full.content?.rendered || '', dryRun);
  const doc = toPostDoc(full, html);
  if (doc.featuredImage.startsWith('/wp-content/uploads/') && !dryRun) {
    if (await downloadUpload(doc.featuredImage.replace('/wp-content/uploads/', ''))) console.log('   + featured image downloaded');
  }
  const scores = scorePost(doc, existingForScore.filter((p) => p.slug !== doc.slug));
  Object.assign(doc.seo, { score: scores.score, readability: scores.readability, grade: scores.grade, scoredAt: new Date() });

  console.log(`  ${dryRun ? 'would import' : existing ? 'update' : 'import'}  ${doc.slug}`);
  console.log(`     title: ${doc.title}\n     status: ${doc.status} | published: ${doc.publishedAt?.toISOString().slice(0, 10) || '-'} | author: ${doc.author}`);
  console.log(`     categories: ${doc.categories.join(', ') || '-'} | images: ${files} (${downloaded} new) | content: ${doc.content.length} chars | seo score: ${scores.score}`);
  if (dryRun) return 'dry';

  if (existing) {
    // Re-importing an existing post is a content resync from WordPress, not
    // a translations reset — never let it wipe out translations already
    // done in the editor (toPostDoc always sets translations: {} for the
    // create path, which is wrong to replay here).
    const { translations, ...updateDoc } = doc;
    await Post.updateOne({ _id: existing._id }, { $set: updateDoc });
    return 'updated';
  }
  await Post.create(doc);
  return 'imported';
}

(async () => {
  const dryRun = flag('--dry-run');
  const force = flag('--force');
  const status = opt('--status'); // publish (default) | draft | pending | future | any

  await connectDB();
  const ours = await Post.find({}, '_id title slug').lean();
  const ourSlugs = new Set(ours.map((p) => p.slug));
  const existingForScore = ours.map((p) => ({ _id: String(p._id), title: p.title, slug: p.slug }));

  let targets = [];
  if (flag('--list') || flag('--missing')) {
    const all = await wpListAll(status ? { status } : {});
    const missing = all.filter((p) => !ourSlugs.has(p.slug)).sort((a, b) => b.date_gmt.localeCompare(a.date_gmt));
    console.log(`WordPress: ${all.length} posts | our DB: ${ours.length} | not in our DB: ${missing.length}`);
    missing.forEach((p) => console.log(`  ${String(p.id).padEnd(7)} ${p.date_gmt.slice(0, 10)}  [${p.status}]  ${p.slug}`));
    if (flag('--list')) return process.exit(0);
    targets = missing;
  }
  for (const slug of opts('--slug')) {
    const { data } = await wpGet('/posts', { slug, _fields: 'id,slug,date_gmt,status', ...(status ? { status } : {}) });
    if (!data.length) console.warn(`  ! no WP post with slug "${slug}"`);
    targets.push(...data);
  }
  for (const id of opts('--id')) {
    const { data } = await wpGet(`/posts/${id}`, { _fields: 'id,slug,date_gmt,status' });
    targets.push(data);
  }
  if (!targets.length) {
    console.log('Nothing to import. Use --list, --missing, --slug <slug> or --id <wpId>.');
    return process.exit(0);
  }

  const tally = {};
  for (const wp of targets) {
    try {
      const r = await importOne(wp, { force, dryRun, existingForScore });
      tally[r] = (tally[r] || 0) + 1;
    } catch (e) {
      console.error(`  ! failed ${wp.slug}: ${e.message}`);
      tally.failed = (tally.failed || 0) + 1;
    }
  }
  console.log('Done:', JSON.stringify(tally));
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });

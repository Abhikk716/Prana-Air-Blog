const path = require('path');
const projectRoot = 'c:/Users/purelogic/.gemini/antigravity-ide/scratch/pranaair-test-blog';
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const connectDB = require(path.join(projectRoot, 'lib/db'));
const Post = require(path.join(projectRoot, 'models/post'));

async function main() {
  await connectDB();

  const wpSlugs = new Set();
  const wpStatusBySlug = {};
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`https://www.pranaair.com/blog/wp-json/wp/v2/posts?lang=en&per_page=100&page=${page}&_fields=id,slug,status,type`);
    if (!res.ok) break;
    const arr = await res.json();
    if (!arr.length) break;
    for (const p of arr) { wpSlugs.add(p.slug); wpStatusBySlug[p.slug] = p.status; }
  }
  console.log('Total EN posts on WordPress (published, default query):', wpSlugs.size);

  // Also check trashed/draft/private via status=any (requires auth normally; try anyway)
  const dbPosts = await Post.find({}).select('slug status').lean();
  const dbSlugs = new Set(dbPosts.map(p => p.slug));
  console.log('Total posts in local DB:', dbSlugs.size);

  const missingInDB = [...wpSlugs].filter(s => !dbSlugs.has(s));
  const extraInDB = [...dbSlugs].filter(s => !wpSlugs.has(s));

  console.log('\nOn WordPress but NOT in local DB (', missingInDB.length, '):');
  console.log(missingInDB);

  console.log('\nIn local DB but NOT found on WordPress EN list (', extraInDB.length, ') -- likely fine (manually created / drafts):');
  console.log(extraInDB);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

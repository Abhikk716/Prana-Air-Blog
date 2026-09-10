// Computes and stores on-page SEO / readability scores (seo.score,
// seo.readability, seo.grade) for posts that don't have them yet, so the
// dashboard can list scores without loading article bodies. The editor
// writes these on every save; this only catches posts saved before that
// existed. Runs without touching updatedAt.
//
//   node scripts/backfill-seo-scores.js          # only unscored posts
//   node scripts/backfill-seo-scores.js --force  # rescore everything
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../lib/db');
const Post = require('../models/post');
const { scorePost } = require('../lib/seoAnalysis');

(async () => {
  const force = process.argv.includes('--force');
  await connectDB();

  const all = await Post.find({}, '_id title slug').lean();
  const existing = all.map(p => ({ _id: String(p._id), title: p.title, slug: p.slug }));

  const filter = force ? {} : { $or: [{ 'seo.score': null }, { 'seo.score': { $exists: false } }] };
  const cursor = Post.find(filter, 'title slug excerpt content featuredImage featuredImageAlt seo').lean().cursor();

  let count = 0;
  for await (const post of cursor) {
    const scores = scorePost(post, existing);
    await Post.updateOne(
      { _id: post._id },
      { $set: { 'seo.score': scores.score, 'seo.readability': scores.readability, 'seo.grade': scores.grade, 'seo.scoredAt': new Date() } },
      { timestamps: false }
    );
    count++;
  }

  console.log(`Scored ${count} post(s) out of ${all.length}.`);
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});

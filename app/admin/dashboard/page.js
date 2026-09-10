import { redirect } from 'next/navigation';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import seoAnalysis from '../../../lib/seoAnalysis';
import DashboardClient from './DashboardClient';
import { isAdminAuthenticated } from '../../../lib/adminAuth';

const { scorePost } = seoAnalysis;

export const dynamic = 'force-dynamic'; // Prevent static caching of dashboard

export default async function AdminDashboard() {
  // 1. Authenticate check on Server Component
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login');
  }

  // 2. Fetch posts from MongoDB Atlas sorted by publication date.
  // The dashboard table only shows title/author/date/status/category,
  // thumbnail, stored scores and which languages a post has — never the
  // article body. Pulling `content` plus every translation for all posts
  // was shipping tens of MB to the browser on every load. This aggregation
  // fetches only what the table needs, reduces `translations` to the list
  // of language codes, and pulls `content` ONLY for posts that have never
  // been scored (so they can be scored below, server-side).
  await connectDB();
  const posts = await Post.aggregate([
    { $sort: { publishedAt: -1 } },
    {
      $project: {
        title: 1,
        slug: 1,
        author: 1,
        status: 1,
        categories: 1,
        publishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        promotion: 1,
        analytics: 1,
        featuredImage: 1,
        featuredImageAlt: 1,
        excerpt: 1,
        'seo.title': 1,
        'seo.description': 1,
        'seo.primaryKeyword': 1,
        'seo.canonicalUrl': 1,
        'seo.score': 1,
        'seo.readability': 1,
        'seo.grade': 1,
        content: {
          $cond: [
            { $in: [{ $type: '$seo.score' }, ['double', 'int', 'long', 'decimal']] },
            '$$REMOVE',
            '$content'
          ]
        },
        translationLangs: {
          $map: {
            input: { $objectToArray: { $ifNull: ['$translations', {}] } },
            as: 't',
            in: '$$t.k'
          }
        },
        // Titles only (never bodies) so the language filter can show the
        // post in the selected language.
        translationTitles: {
          $arrayToObject: {
            $map: {
              input: { $objectToArray: { $ifNull: ['$translations', {}] } },
              as: 't',
              in: { k: '$$t.k', v: { $ifNull: ['$$t.v.title', ''] } }
            }
          }
        }
      }
    }
  ]);

  // 3. Score any post that was never scored (saved before scores existed
  // and not yet backfilled), then drop the body before serializing.
  const existing = posts.map(p => ({ _id: String(p._id), title: p.title, slug: p.slug }));
  for (const post of posts) {
    if (typeof post.seo?.score !== 'number') {
      const scores = scorePost(post, existing);
      post.seo = { ...(post.seo || {}), score: scores.score, readability: scores.readability, grade: scores.grade };
    }
    delete post.content;
  }

  const uniqueCategories = await Post.distinct('categories');

  // 4. Serialize data (convert MongoDB ObjectIds/Dates to plain JSON values)
  const serializedPosts = JSON.parse(JSON.stringify(posts));

  return (
    <div className="admin-dashboard-page">
      <DashboardClient initialPosts={serializedPosts} categories={uniqueCategories} />
    </div>
  );
}

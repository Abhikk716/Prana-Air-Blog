import { redirect } from 'next/navigation';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import DashboardClient from './DashboardClient';
import { isAdminAuthenticated } from '../../../lib/adminAuth';

export const dynamic = 'force-dynamic'; // Prevent static caching of dashboard

export default async function AdminDashboard() {
  // 1. Authenticate check on Server Component
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login');
  }

  // 2. Fetch posts from MongoDB Atlas sorted by publication date.
  // The dashboard table only ever shows title/author/date/status/category
  // and which languages a post has — never the actual article body. Pulling
  // `content` plus every translation's full content (title/content/excerpt/
  // seo per language) for all posts was shipping tens of MB to the browser
  // on every dashboard load, which is what made navigation feel slow. This
  // aggregation fetches only the fields the table needs, and reduces
  // `translations` down to just the list of language codes present.
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
        promotion: 1,
        analytics: 1,
        translationLangs: {
          $map: {
            input: { $objectToArray: { $ifNull: ['$translations', {}] } },
            as: 't',
            in: '$$t.k'
          }
        }
      }
    }
  ]);
  const uniqueCategories = await Post.distinct('categories');

  // 3. Serialize data (convert MongoDB ObjectIds/Dates to plain JSON values)
  const serializedPosts = JSON.parse(JSON.stringify(posts));

  return (
    <div className="admin-dashboard-page">
      <DashboardClient initialPosts={serializedPosts} categories={uniqueCategories} />
    </div>
  );
}

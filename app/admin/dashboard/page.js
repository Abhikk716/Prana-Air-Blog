import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic'; // Prevent static caching of dashboard

export default async function AdminDashboard() {
  // 1. Authenticate check on Server Component
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');

  if (!session || session.value !== 'authenticated') {
    redirect('/admin/login');
  }

  // 2. Fetch posts from MongoDB Atlas sorted by publication date
  await connectDB();
  const posts = await Post.find().sort({ publishedAt: -1 });
  const uniqueCategories = await Post.distinct('categories');

  // 3. Serialize data (convert MongoDB ObjectIds, Dates, and Map subdocuments to standard JSON types)
  const serializedPosts = posts.map((post) => {
    const p = post.toObject ? post.toObject({ getters: true, flattenMaps: true }) : post;
    const plain = JSON.parse(JSON.stringify(p));
    
    // Ensure translations is at least an empty object if undefined
    if (!plain.translations) {
      plain.translations = {};
    }
    
    return plain;
  });

  return (
    <div className="admin-dashboard-page" style={{ padding: '2rem 1rem' }}>
      <DashboardClient initialPosts={serializedPosts} categories={uniqueCategories} />
    </div>
  );
}

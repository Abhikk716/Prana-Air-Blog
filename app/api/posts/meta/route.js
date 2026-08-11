import connectDB from '../../../../lib/db';
import Post from '../../../../models/post';

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/posts/meta - Returns categories, popular posts, trending tags
// Used by the main website sidebar
export async function GET() {
  try {
    await connectDB();

    // Category counts
    const allPublished = await Post.find({ status: 'published' }, 'categories');
    const categoryCounts = {};
    allPublished.forEach(post => {
      if (post.categories) {
        post.categories.forEach(cat => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      }
    });
    const categories = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .filter(cat => cat.name !== 'カテゴリーなし' && cat.name !== 'Uncategorized')
      .sort((a, b) => b.count - a.count);

    // Popular posts (latest 4)
    const popularRaw = await Post.find({ status: 'published' }, 'slug title publishedAt featuredImage')
      .sort({ publishedAt: -1 })
      .limit(4)
      .lean();
    const popularPosts = JSON.parse(JSON.stringify(popularRaw));

    // Trending tags (top 12 unique tags)
    const uniqueTags = await Post.distinct('tags', { status: 'published' });
    const trendingTags = uniqueTags.slice(0, 12);

    return Response.json({
      success: true,
      data: {
        totalPublished: allPublished.length,
        categories,
        popularPosts,
        trendingTags,
      }
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching meta:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}

import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import { isAdminAuthenticated } from '../../../lib/adminAuth';

// CORS headers – allow any origin to fetch blog content (public API)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function translatePost(post, lang) {
  if (!lang || lang === 'en') return post;
  
  const translations = post.translations;
  if (!translations) return post;

  // Handle both Map and plain object representations
  const t = translations.get ? translations.get(lang) : translations[lang];
  if (!t) return post;

  return {
    ...post,
    title: t.title || post.title,
    content: t.content || post.content,
    excerpt: t.excerpt || post.excerpt,
    seo: {
      title: t.seo?.title || post.seo?.title,
      description: t.seo?.description || post.seo?.description,
      keywords: t.seo?.keywords || post.seo?.keywords || [],
    }
  };
}

// OPTIONS – preflight for CORS
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/posts - Fetch all posts (support query filters like status, category, tag, search, lang, page, limit)
export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const tag = searchParams.get('tag');
    const search = searchParams.get('search');
    const lang = searchParams.get('lang') || 'en';
    const limit = parseInt(searchParams.get('limit') || '10');
    const page = parseInt(searchParams.get('page') || '1');

    const query = {};
    if (status) query.status = status;
    if (category) query.categories = category;
    if (tag) query.tags = tag;
    if (search) {
      // Escape regex metacharacters so user input can't build an expensive
      // or unintended pattern (regex injection / ReDoS risk on a public endpoint).
      const safeSearch = search.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
        { content: { $regex: safeSearch, $options: 'i' } },
        { excerpt: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    // Use .lean() to get plain JS objects — avoids Mongoose Map/ObjectId serialization issues
    const rawPosts = await Post.find(query)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Post.countDocuments(query);

    // Safely stringify then parse to ensure all ObjectIds/Dates are plain values
    const posts = JSON.parse(JSON.stringify(rawPosts));

    const translatedPosts = posts.map(post => translatePost(post, lang));

    return Response.json({
      success: true,
      data: translatedPosts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}


// POST /api/posts - Create a new blog post
export async function POST(request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();

    // Generate slug if not provided
    if (!body.slug && body.title) {
      body.slug = body.title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
    }

    // Handle published date assignment
    if (body.status === 'published' && !body.publishedAt) {
      body.publishedAt = new Date();
    }

    const newPost = await Post.create(body);

    return Response.json({ success: true, data: newPost }, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    // Handle duplicate key error for slug
    if (error.code === 11000) {
      return Response.json({ success: false, error: 'A post with this slug already exists.' }, { status: 400 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

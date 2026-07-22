import connectDB from '../../../../lib/db';
import Post from '../../../../models/post';
import mongoose from 'mongoose';

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function translatePost(post, lang) {
  if (!lang || lang === 'en') return post;
  const translations = post.translations;
  if (!translations) return post;
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

// GET /api/posts/[id] - Fetch a single post by ID or Slug
export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'en';

    let rawPost;
    // Check if ID is a valid MongoDB ObjectId, if not, search by slug
    if (mongoose.Types.ObjectId.isValid(id)) {
      rawPost = await Post.findById(id);
    } else {
      rawPost = await Post.findOne({ slug: id });
    }

    if (!rawPost) {
      return Response.json({ success: false, error: 'Post not found.' }, { status: 404, headers: CORS_HEADERS });
    }

    let post = JSON.parse(JSON.stringify(rawPost.toObject({ getters: true, flattenMaps: true })));
    
    // Fix broken relative image paths from WordPress migration
    if (post.content && post.content.includes('src="/wp-content/')) {
      post.content = post.content.replace(/src="\/wp-content\//g, 'src="https://www.pranaair.com/wp-content/');
    }

    // Make tables responsive and styled like live WP site
    if (post.content && post.content.includes('<table')) {
      const tableStyles = `
<style>
  .prose-editorial table {
    width: 100% !important;
    border-collapse: collapse !important;
    margin: 1.5rem 0 !important;
    font-size: 0.9rem !important;
    line-height: 1.5 !important;
  }
  .prose-editorial th, .prose-editorial td {
    border: 1px solid #d1d5db !important;
    padding: 0.75rem !important;
    text-align: left !important;
    word-break: break-word !important;
    vertical-align: top !important;
  }
  .prose-editorial th {
    font-weight: 700 !important;
    background-color: #f9fafb !important;
    color: #374151 !important;
  }
  .table-responsive-wrapper {
    overflow-x: auto;
    width: 100%;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 1.5rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    border-radius: 0.375rem;
  }
</style>
`;
      // Remove any existing wrapper to prevent double wrapping if I applied it earlier
      let cleanContent = post.content.replace(/<div class="table-responsive-wrapper"[^>]*>([\s\S]*?)<\/div>/gi, '$1');
      post.content = tableStyles + cleanContent.replace(/(<table[^>]*>[\s\S]*?<\/table>)/gi, '<div class="table-responsive-wrapper">$1</div>');
    }

    const translated = translatePost(post, lang);

    return Response.json({ success: true, data: translated }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching post:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}


// PUT /api/posts/[id] - Update an existing post by ID or Slug
export async function PUT(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    let post;
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };

    // Handle published date assignment when status changes to published
    if (body.status === 'published') {
      const existingPost = await Post.findOne(query);
      if (existingPost && !existingPost.publishedAt) {
        body.publishedAt = new Date();
      }
    }

    post = await Post.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });

    if (!post) {
      return Response.json({ success: false, error: 'Post not found.' }, { status: 404 });
    }

    return Response.json({ success: true, data: post });
  } catch (error) {
    console.error('Error updating post:', error);
    if (error.code === 11000) {
      return Response.json({ success: false, error: 'A post with this slug already exists.' }, { status: 400 });
    }
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/posts/[id] - Delete a post by ID or Slug
export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;

    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { slug: id };
    const deletedPost = await Post.findOneAndDelete(query);

    if (!deletedPost) {
      return Response.json({ success: false, error: 'Post not found.' }, { status: 404 });
    }

    return Response.json({ success: true, message: 'Post deleted successfully.' });
  } catch (error) {
    console.error('Error deleting post:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

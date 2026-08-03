import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import Post from '../../../../models/post';

export async function POST(request) {
  try {
    const { slug, action, lang } = await request.json();

    if (!slug || !action) {
      return NextResponse.json({ success: false, error: 'Missing slug or action' }, { status: 400 });
    }

    await connectDB();

    let updateQuery = {};

    if (action === 'view') {
      updateQuery = { $inc: { 'analytics.views': 1 } };
      if (lang) {
        updateQuery.$inc[`analytics.viewsByLang.${lang}`] = 1;
      }
    } else if (action === 'promotion_click') {
      updateQuery = { $inc: { 'analytics.promotionClicks': 1 } };
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }

    const post = await Post.findOneAndUpdate(
      { slug },
      updateQuery,
      { new: true }
    );

    if (!post) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    // Set CORS headers so the main frontend can call this endpoint
    return NextResponse.json(
      { success: true },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      }
    );
  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

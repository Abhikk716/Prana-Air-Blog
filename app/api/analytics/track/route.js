import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import Post from '../../../../models/post';

const rateLimitCache = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request) {
  try {
    const { slug, action, lang } = await request.json();
    
    // Get client IP (first hop of x-forwarded-for; trustworthy behind Vercel's
    // edge network, but note this header can be spoofed on self-hosted setups
    // without a trusted reverse proxy in front of Next.js)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.ip || 'unknown-ip';
    const cacheKey = `${ip}_${slug}_${action}`;
    
    // Simple Rate Limiting: Prevent duplicate action from same IP within the window
    if (action === 'view') {
      const lastRequestTime = rateLimitCache.get(cacheKey);
      const now = Date.now();
      if (lastRequestTime && (now - lastRequestTime < RATE_LIMIT_WINDOW_MS)) {
        // Ignored to prevent spam, return success anyway to client
        return NextResponse.json({ success: true, ignored: true }, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }
      // Update cache
      rateLimitCache.set(cacheKey, now);
      
      // Cleanup old cache entries occasionally to prevent memory leak
      if (rateLimitCache.size > 10000) {
        for (const [key, timestamp] of rateLimitCache.entries()) {
          if (now - timestamp > RATE_LIMIT_WINDOW_MS) {
            rateLimitCache.delete(key);
          }
        }
      }
    }

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

    // Upsert Daily Analytics
    try {
      const DailyAnalytics = require('../../../../models/DailyAnalytics');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let dailyUpdate = {};
      if (action === 'view') {
        dailyUpdate = { $inc: { views: 1 } };
        if (lang) {
          dailyUpdate.$inc[`viewsByLang.${lang}`] = 1;
        }
      } else if (action === 'promotion_click') {
        dailyUpdate = { $inc: { promotionClicks: 1 } };
      }

      await DailyAnalytics.findOneAndUpdate(
        { postId: post._id, date: today },
        dailyUpdate,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (dailyErr) {
      console.error('Failed to update daily analytics:', dailyErr);
      // We don't fail the whole request just because daily analytics failed
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

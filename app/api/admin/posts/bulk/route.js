import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '../../../../../lib/db';
import Post from '../../../../../models/post';
import { isAdminAuthenticated } from '../../../../../lib/adminAuth';

const ACTIONS = new Set(['delete', 'publish', 'draft']);

// POST /api/admin/posts/bulk  { action: 'delete' | 'publish' | 'draft', ids: [] }
// Used by the dashboard's multi-select bar.
export async function POST(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, ids } = await request.json();
    if (!ACTIONS.has(action)) {
      return NextResponse.json({ success: false, error: 'Unknown bulk action.' }, { status: 400 });
    }
    const validIds = (Array.isArray(ids) ? ids : []).filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid post ids were provided.' }, { status: 400 });
    }

    await connectDB();
    const filter = { _id: { $in: validIds } };
    let affected = 0;

    if (action === 'delete') {
      const result = await Post.deleteMany(filter);
      affected = result.deletedCount;
    } else if (action === 'publish') {
      // Same rule as the single-post PUT: first publish stamps publishedAt.
      await Post.updateMany({ ...filter, publishedAt: null }, { $set: { publishedAt: new Date() } });
      const result = await Post.updateMany(filter, { $set: { status: 'published' } });
      affected = result.matchedCount;
    } else {
      const result = await Post.updateMany(filter, { $set: { status: 'draft' } });
      affected = result.matchedCount;
    }

    // Hand back the rows' new state so the dashboard can update in place.
    const posts = action === 'delete'
      ? []
      : await Post.find(filter, 'status publishedAt updatedAt').lean();

    return NextResponse.json({
      success: true,
      action,
      affected,
      posts: JSON.parse(JSON.stringify(posts))
    });
  } catch (error) {
    console.error('Bulk post action error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Bulk action failed.' }, { status: 500 });
  }
}

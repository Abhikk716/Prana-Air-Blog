import { NextResponse } from 'next/server';
import connectDB from '../../../../../lib/db';
import Post from '../../../../../models/post';
import { isAdminAuthenticated } from '../../../../../lib/adminAuth';
import { getBlogAnalytics } from '../../../../../lib/ga4';

export const dynamic = 'force-dynamic';

// GET /api/admin/analytics/ga4?from=YYYY-MM-DD&to=YYYY-MM-DD[&prevFrom&prevTo][&lang=][&category=]
// GET /api/admin/analytics/ga4?mode=lifetime[&lang=][&category=]
//
// Blog traffic from the GA4 property for the window plus the equal-length
// period before it (derived here unless the caller passes its own), or for
// the property's whole history with `mode=lifetime` (monthly series, plus
// last-30-day totals for the tiles). Dates are plain calendar days in the
// property's timezone. Only /blog/ paths are counted. A category is resolved to the slugs of its posts and sent to
// Google as a path filter, so every figure (not just the pages table) is
// scoped by it. Responses are cached in memory for 10 minutes per
// window/language/category.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANG_RE = /^[a-z]{2}(-[A-Za-z]{2})?$|^all$/;
const CATEGORY_MAX = 120;

function toDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toKey(date) { return date.toISOString().slice(0, 10); }
function shiftDays(key, n) {
  const d = toDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

export async function GET(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') === 'lifetime' ? 'lifetime' : 'window';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const lang = searchParams.get('lang') || 'all';
  if (mode === 'window' && (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to)) {
    return NextResponse.json({ success: false, error: 'from/to must be YYYY-MM-DD with from <= to' }, { status: 400 });
  }
  if (!LANG_RE.test(lang)) {
    return NextResponse.json({ success: false, error: 'Invalid lang' }, { status: 400 });
  }
  const categoryParam = (searchParams.get('category') || '').trim();
  const category = categoryParam && categoryParam !== 'all' ? categoryParam : '';
  if (category.length > CATEGORY_MAX) {
    return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
  }

  let prevFrom = searchParams.get('prevFrom') || '';
  let prevTo = searchParams.get('prevTo') || '';
  if (mode === 'lifetime') {
    prevFrom = ''; prevTo = '';
  } else if (!DAY_RE.test(prevFrom) || !DAY_RE.test(prevTo) || prevFrom > prevTo || prevTo >= from) {
    const days = Math.round((toDate(to) - toDate(from)) / 86400000) + 1;
    prevTo = shiftDays(from, -1);
    prevFrom = shiftDays(prevTo, -(days - 1));
  }

  try {
    let slugs = null;
    if (category) {
      await connectDB();
      const posts = await Post.find({ categories: category }, { slug: 1, _id: 0 }).lean();
      slugs = posts.map(p => p.slug).filter(Boolean);
    }
    const data = await getBlogAnalytics({
      mode, from: mode === 'lifetime' ? '' : from, to: mode === 'lifetime' ? '' : to, prevFrom, prevTo, lang, category, slugs
    });
    return NextResponse.json({ success: true, configured: true, data });
  } catch (error) {
    if (error.code === 'not_configured') {
      return NextResponse.json({ success: true, configured: false, reason: error.message });
    }
    console.error('GA4 analytics error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Could not reach Google Analytics' },
      { status: 502 }
    );
  }
}

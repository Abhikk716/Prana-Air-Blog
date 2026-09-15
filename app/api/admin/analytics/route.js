import { NextResponse } from 'next/server';
import connectDB from '../../../../lib/db';
import DailyAnalytics from '../../../../models/DailyAnalytics';
import { isAdminAuthenticated } from '../../../../lib/adminAuth';

export const dynamic = 'force-dynamic';

// The tracker stores each row's `date` as midnight in the server's timezone
// (see /api/analytics/track), so both the range query and the `day` key the
// client groups by are built from the server's local calendar. The client
// passes plain YYYY-MM-DD strings (`from`/`to`, inclusive) and matches rows by
// string, which keeps a viewer in any timezone on the same days as the DB.
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDay(value, endOfDay) {
  const m = DAY_RE.exec(value || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function dayKey(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export async function GET(request) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);

    // ?group=month — the whole history folded into per-post, per-month
    // totals (`month` is YYYY-MM in the same server calendar as `day`). The
    // analytics tab uses it for the all-time banner-click chart; the daily
    // rows below stay the source for date ranges.
    if (searchParams.get('group') === 'month') {
      const rows = await DailyAnalytics.find({}, { postId: 1, date: 1, views: 1, promotionClicks: 1 }).lean();
      const buckets = new Map();
      for (const r of rows) {
        const key = `${String(r.postId)}|${dayKey(r.date).slice(0, 7)}`;
        const b = buckets.get(key) || { postId: String(r.postId), month: dayKey(r.date).slice(0, 7), views: 0, promotionClicks: 0 };
        b.views += r.views || 0;
        b.promotionClicks += r.promotionClicks || 0;
        buckets.set(key, b);
      }
      const data = [...buckets.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
      return NextResponse.json({ success: true, data });
    }

    let start = parseDay(searchParams.get('from'), false);
    let end = parseDay(searchParams.get('to'), true);

    // Older callers sent full ISO timestamps.
    if (!start || !end) {
      const startDateParam = searchParams.get('startDate');
      const endDateParam = searchParams.get('endDate');
      if (startDateParam && endDateParam) {
        start = new Date(startDateParam);
        end = new Date(endDateParam);
      }
    }

    const query = {};
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      query.date = { $gte: start, $lte: end };
    }

    // Post details (title, categories, …) are already loaded by the dashboard,
    // so rows only carry the post id and the counters — no populate.
    const rows = await DailyAnalytics.find(query, {
      postId: 1, date: 1, views: 1, viewsByLang: 1, promotionClicks: 1
    }).sort({ date: 1 }).lean();

    const data = rows.map(r => ({
      postId: String(r.postId),
      day: dayKey(r.date),
      views: r.views || 0,
      promotionClicks: r.promotionClicks || 0,
      viewsByLang: r.viewsByLang || {}
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

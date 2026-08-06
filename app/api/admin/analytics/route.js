import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectDB from '../../../../lib/db';
import DailyAnalytics from '../../../../models/DailyAnalytics';
import Post from '../../../../models/post';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');

    if (!session || session.value !== 'authenticated') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Query filters
    const query = {};

    if (startDateParam && endDateParam) {
      query.date = {
        $gte: new Date(startDateParam),
        $lte: new Date(endDateParam)
      };
    }

    // Fetch analytics data
    const analytics = await DailyAnalytics.find(query).populate('postId', 'title slug categories').lean();

    // Serialize correctly for JSON
    const serialized = analytics.map(a => {
      const plain = JSON.parse(JSON.stringify(a));
      return plain;
    });

    return NextResponse.json({ success: true, data: serialized });
  } catch (error) {
    console.error('Error fetching admin analytics:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

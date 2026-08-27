import { isAdminAuthenticated } from '../../../../lib/adminAuth';

export async function GET() {
  try {
    if (await isAdminAuthenticated()) {
      return Response.json({ success: true, authenticated: true });
    }

    return Response.json({ success: false, authenticated: false }, { status: 401 });
  } catch (error) {
    console.error('Check auth error:', error);
    return Response.json({ success: false, authenticated: false }, { status: 500 });
  }
}

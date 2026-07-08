import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');

    if (session && session.value === 'authenticated') {
      return Response.json({ success: true, authenticated: true });
    }
    
    return Response.json({ success: false, authenticated: false }, { status: 401 });
  } catch (error) {
    console.error('Check auth error:', error);
    return Response.json({ success: false, authenticated: false }, { status: 500 });
  }
}

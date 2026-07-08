import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete('admin_session');
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return Response.json(
      { success: false, error: 'Failed to clear session.' },
      { status: 500 }
    );
  }
}

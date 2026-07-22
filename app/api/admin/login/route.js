import { cookies } from 'next/headers';

export async function POST(request) {
  try {
    const { username, password } = await request.json();

    const expectedUsername = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedUsername || !expectedPassword) {
      console.error('Missing ADMIN_USERNAME or ADMIN_PASSWORD in environment variables.');
      return Response.json(
        { success: false, error: 'Server configuration error.' },
        { status: 500 }
      );
    }

    if (username === expectedUsername && password === expectedPassword) {
      // Set secure HTTP-only cookie
      const cookieStore = await cookies();
      cookieStore.set('admin_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
      });

      return Response.json({ success: true });
    } else {
      return Response.json(
        { success: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return Response.json(
      { success: false, error: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}

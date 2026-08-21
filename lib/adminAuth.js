import { cookies } from 'next/headers';

// Shared session check used by every admin-only API route.
export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return !!session && session.value === 'authenticated';
}

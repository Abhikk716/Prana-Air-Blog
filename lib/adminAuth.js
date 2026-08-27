import { cookies } from 'next/headers';
import { verifySessionToken } from './sessionToken';

// Shared session check used by every admin-only API route.
export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return verifySessionToken(session?.value);
}

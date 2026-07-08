import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BlogHome() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');

  if (session && session.value === 'authenticated') {
    redirect('/admin/dashboard');
  } else {
    redirect('/admin/login');
  }
}

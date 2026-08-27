import { redirect } from 'next/navigation';
import { isAdminAuthenticated } from '../lib/adminAuth';

export const dynamic = 'force-dynamic';

export default async function BlogHome() {
  if (await isAdminAuthenticated()) {
    redirect('/admin/dashboard');
  } else {
    redirect('/admin/login');
  }
}

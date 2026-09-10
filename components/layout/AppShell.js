'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import HeaderNav from './HeaderNav';

// The admin login screen shouldn't show the public site header/nav — it's
// confusing to see "Analytics / All Posts / Banners / Logout" while you're
// still on the login form. Everywhere else keeps the normal site chrome.
const CHROME_LESS_ROUTES = ['/admin/login'];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const hideChrome = CHROME_LESS_ROUTES.includes(pathname);
  // The editor and the dashboard both need the wide (1600px) layout: the
  // posts table has nine columns and gets clipped in the default 1200px.
  const isEditor = pathname?.startsWith('/admin/editor') || pathname?.startsWith('/admin/dashboard');

  if (hideChrome) {
    return <main className="main-content">{children}</main>;
  }

  return (
    <>
      <header className={`main-header ${isEditor ? 'header-full' : ''}`}>
        <div className={`header-container ${isEditor ? 'header-container-full' : ''}`}>
          <a href="/" className="logo">
            Prana Air <span className="logo-accent">Blog</span>
          </a>
          <Suspense fallback={null}>
            <HeaderNav />
          </Suspense>
        </div>
      </header>

      <main className={`main-content ${isEditor ? 'main-content-full' : ''}`}>
        {children}
      </main>

      <footer className="main-footer">
        <div className={`footer-container ${isEditor ? 'footer-container-full' : ''}`}>
          <div className="footer-info">
            <h3>Prana Air</h3>
            <p>Empowering you to breathe clean air through advanced monitoring and purification technology.</p>
          </div>
          <div className="footer-copyright">
            <p>&copy; {new Date().getFullYear()} Prana Air. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

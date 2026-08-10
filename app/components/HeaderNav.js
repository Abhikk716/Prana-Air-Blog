'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function HeaderNav() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'analytics';

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/admin/check-auth');
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [pathname]); // Re-check when route changes to stay in sync

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/admin/logout', {
        method: 'POST',
      });
      if (res.ok) {
        setIsAuthenticated(false);
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return <nav className="nav-links" style={{ minHeight: '40px' }}></nav>;
  }

  const linkStyle = (isActive) => ({
    padding: '0.5rem 1rem',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.95rem',
    textDecoration: 'none',
    transition: 'all 0.2s',
    backgroundColor: isActive ? 'rgba(116, 183, 92, 0.1)' : 'transparent',
    color: isActive ? '#74b75c' : '#4b5563',
  });

  return (
    <nav className="nav-links">
      {isAuthenticated && (
        <>
          <a 
            href="/admin/dashboard?tab=analytics" 
            style={linkStyle(pathname === '/admin/dashboard' && activeTab === 'analytics')}
          >
            Analytics
          </a>
          <a 
            href="/admin/dashboard?tab=posts" 
            style={linkStyle(pathname === '/admin/dashboard' && activeTab === 'posts')}
          >
            All Posts
          </a>
          <a 
            href="/admin/dashboard?tab=banners" 
            style={linkStyle(pathname === '/admin/dashboard' && activeTab === 'banners')}
          >
            Banners
          </a>
          <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb', margin: '0 0.5rem' }}></div>
          <button 
            onClick={handleLogout} 
            style={{ 
              background: 'transparent', 
              border: '1px solid #ef4444', 
              cursor: 'pointer', 
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '0.4rem 1rem',
              borderRadius: '6px',
              color: '#ef4444',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.05)'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
          >
            Logout
          </button>
        </>
      )}
    </nav>
  );
}

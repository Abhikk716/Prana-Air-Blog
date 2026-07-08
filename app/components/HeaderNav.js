'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function HeaderNav() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

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
    return (
      <nav className="nav-links">
        <a href="/" className="nav-item">Home</a>
      </nav>
    );
  }

  return (
    <nav className="nav-links">
      {isAuthenticated ? (
        <>
          <a href="/admin/dashboard" className="nav-item">Dashboard</a>
          <button 
            onClick={handleLogout} 
            className="nav-item" 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 500,
              padding: 0
            }}
          >
            Logout
          </button>
        </>
      ) : null}
    </nav>
  );
}

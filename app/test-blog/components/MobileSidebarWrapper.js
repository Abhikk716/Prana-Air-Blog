'use client';
import React, { useState, useEffect } from 'react';

export default function MobileSidebarWrapper({ children, buttonText }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      <button 
        className="mobile-sidebar-toggle d-lg-none"
        onClick={() => setIsOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        {buttonText || 'Explore'}
      </button>

      {isOpen && (
        <div 
          className="mobile-sidebar-backdrop d-lg-none"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      <div className={`mobile-sidebar-container ${isOpen ? 'open' : ''}`}>
        <div className="mobile-sidebar-header d-lg-none">
          <h5 style={{ margin: 0, fontWeight: 700, fontSize: '18px' }}>{buttonText || 'Explore'}</h5>
          <button 
            className="mobile-sidebar-close"
            onClick={() => setIsOpen(false)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div className="mobile-sidebar-content">
          {children}
        </div>
      </div>
    </>
  );
}

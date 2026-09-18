'use client';

import React from 'react';

export default function SocialSidebar({ url = '', title = '' }) {
  const currentUrl = typeof window !== 'undefined' ? (url || window.location.href) : url;
  const currentTitle = title || '';

  const shareLinks = [
    {
      name: 'X',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(currentTitle)}&url=${encodeURIComponent(currentUrl)}`
    },
    {
      name: 'Facebook',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.704 0-1.22.124-1.547.371-.418.316-.628.847-.628 1.581v2.029h4.31l-.669 3.667h-3.641v7.98c5.441-1.143 9.519-5.967 9.519-11.691 0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.724 4.078 10.548 9.519 11.691Z" />
        </svg>
      ),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ),
      href: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(currentTitle)}`
    },
    {
      name: 'WhatsApp',
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.301-.15-1.78-1.78-2.056-.88-.276-.1-.476-.15-.676.15-.2.3-.776.98-.952 1.18-.175.2-.35.225-.651.075s-1.272-.47-2.423-1.496c-.895-.798-1.5-1.784-1.675-2.084-.175-.3-.019-.462.13-.612.136-.135.301-.35.451-.525.15-.175.2-.3.301-.5.1-.2.05-.375-.025-.525s-.677-1.633-.928-2.238c-.244-.588-.493-.508-.677-.518-.175-.008-.376-.01-.577-.01s-.526.075-.802.375c-.276.3-1.052 1.028-1.052 2.508s1.077 2.907 1.228 3.108c.15.2 2.12 3.237 5.136 4.54.717.311 1.277.496 1.713.634.72.229 1.376.196 1.895.119.579-.086 1.78-.727 2.03-1.428.25-.702.25-1.303.175-1.428-.075-.126-.275-.2-.576-.35zm-5.419 7.42c-2.04 0-3.938-.543-5.59-1.488l-.4-.228-4.148 1.088 1.107-4.043-.25-.398A10.82 10.82 0 0 1 1.25 10.999C1.25 5.044 6.094.2 12.053.2c2.887 0 5.601 1.125 7.643 3.167A10.74 10.74 0 0 1 22.857 11c0 5.956-4.845 10.802-10.804 10.802z"/>
        </svg>
      ),
      href: `https://api.whatsapp.com/send?text=${encodeURIComponent(currentTitle + " " + currentUrl)}`
    }
  ];

  return (
    <aside className="editorial-social-sidebar" aria-label="Share article">
      {shareLinks.map((link) => (
        <a 
          key={link.name} 
          href={link.href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="social-btn"
          title={`Share on ${link.name}`}
          aria-label={`Share on ${link.name}`}
        >
          {link.icon}
        </a>
      ))}
    </aside>
  );
}

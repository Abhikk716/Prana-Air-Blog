'use client';

import React from 'react';

export default function SocialSidebar({ url = '', title = '' }) {
  const shareLinks = [
    { name: 'X', icon: 'fab fa-x-twitter', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}` },
    { name: 'Facebook', icon: 'fab fa-facebook-f', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { name: 'LinkedIn', icon: 'fab fa-linkedin-in', href: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}` },
    { name: 'WhatsApp', icon: 'fab fa-whatsapp', href: `https://api.whatsapp.com/send?text=${encodeURIComponent(title + " " + url)}` }
  ];

  return (
    <div className="editorial-social-sidebar">
      {shareLinks.map((link) => (
        <a 
          key={link.name} 
          href={link.href} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="social-btn group"
          title={`Share on ${link.name}`}
        >
          <i className={`${link.icon} social-icon`}></i>
          <span className="social-label">{link.name}</span>
        </a>
      ))}
    </div>
  );
}

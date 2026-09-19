'use client';

import React, { useState, useEffect } from 'react';

// Same codes/grouping as the editor's language tabs. The dashboard renders
// them as a grid of small code chips, the analytics tab as ranked rows.
export const LANGUAGE_ROWS = [
  [
    { code: 'in', short: 'IN', label: 'English · India' },
    { code: 'us', short: 'US', label: 'English · USA' },
    { code: 'en-GB', short: 'GB', label: 'English · UK' },
    { code: 'en-CA', short: 'CA', label: 'English · Canada' },
    { code: 'en-AU', short: 'AU', label: 'English · Australia' },
    { code: 'sg', short: 'SG', label: 'English · Singapore' }
  ],
  [
    { code: 'hi', short: 'HI', label: 'Hindi' },
    { code: 'es', short: 'ES', label: 'Spanish' },
    { code: 'de', short: 'DE', label: 'German' },
    { code: 'fr', short: 'FR', label: 'French' },
    { code: 'ru', short: 'RU', label: 'Russian' },
    { code: 'ja', short: 'JA', label: 'Japanese' },
    { code: 'pt-PT', short: 'PT', label: 'Portuguese' }
  ]
];
export const ALL_LANGUAGES = LANGUAGE_ROWS.flat();

// Minimal inline icon set for the dashboard — avoids pulling in an icon
// library for a handful of glyphs. All stroke-based so `currentColor` picks
// up whatever accent color the wrapper sets.
const ICONS = {
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18 M10.6 10.6a3 3 0 0 0 4.2 4.2 M9.9 5.1A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 3.9 M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 5.4-1.4',
  click: 'M9 2v3M9 16v3M2 9h3M16 9h3M4.2 4.2l2.1 2.1M13.7 13.7l2.1 2.1 M9 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  trendUp: 'M2 17l6-6 4 4 10-10 M15 5h7v7',
  trendDown: 'M2 7l6 6 4-4 10 10 M15 19h7v-7',
  minus: 'M5 12h14',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  doc: 'M6 2h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z M13 2v5h5',
  bars: 'M4 20V10 M12 20V4 M20 20v-7',
  divide: 'M5 12h14 M12 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M12 19a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  calendar: 'M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M3 10h18 M8 3v4 M16 3v4',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9Z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  tag: 'M20.6 13.4l-7.2 7.2a1 1 0 0 1-1.4 0L3 11.6V3h8.6l9 9a1 1 0 0 1 0 1.4Z M7.5 7.5h.01',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 2',
  book: 'M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2Z M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7Z',
  pen: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
  check: 'M20 6L9 17l-5-5',
  alert: 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 5V5L6 10H4a1 1 0 0 0-1 1Z M14 8a4 4 0 0 1 0 8 M17 4a8 8 0 0 1 0 16',
  news: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M7 8h6v5H7Z M16 8h1 M16 11h1 M7 16h10',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M23 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8Z',
  monitor: 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 21h8 M12 17v4',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3Z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 6v6l4 2',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3',
  ga: 'M4 20V10 M12 20V4 M20 20v-7',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6'
};
export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Titles migrated from WordPress can contain entities ("&amp;", "&#8217;").
// They render literally inside JSX text, so decode the common ones here.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(text) {
  if (!text || text.indexOf('&') === -1) return text || '';
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

// Small featured-image thumbnail. Migrated images live under
// /wp-content/uploads (served from /public when present); if a local copy is
// missing, fall back to the WordPress host once, then to a placeholder.
export function PostThumb({ src, alt }) {
  const [state, setState] = useState('ok'); // ok | fallback | broken
  useEffect(() => { setState('ok'); }, [src]);

  if (!src || state === 'broken') {
    return (
      <div 
        className="post-thumb" 
        aria-hidden="true" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          backgroundColor: '#f5f5f5', 
          overflow: 'hidden' 
        }}
      >
        <img
          src="https://pranaair.com/img/prana-air-logo.webp"
          alt="Prana Air"
          style={{ maxWidth: '70%', maxHeight: '70%', objectFit: 'contain', opacity: 0.9 }}
        />
      </div>
    );
  }
  // Normalize missing leading slash for relative paths
  let cleanSrc = (src && !src.startsWith('http') && !src.startsWith('/')) ? '/' + src : (src || '');
  
  let resolved = cleanSrc;

  if (process.env.NEXT_PUBLIC_DOMAIN && cleanSrc.startsWith('/') && !cleanSrc.startsWith('//')) {
    resolved = `${process.env.NEXT_PUBLIC_DOMAIN.replace(/\/+$/, '')}${cleanSrc}`;
  } else if (!cleanSrc.startsWith('http')) {
    // Both wp-content and uploads are served locally via the /cms basePath
    resolved = `/cms${cleanSrc}`;
  }

  return (
    <div className="post-thumb">
      <img
        src={resolved}
        alt={alt || ''}
        loading="lazy"
        onError={() => setState(prev => (prev === 'ok' ? 'broken' : 'broken'))}
      />
    </div>
  );
}

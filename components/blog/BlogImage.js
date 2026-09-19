"use client";
import React, { useState, useEffect } from 'react';

const FALLBACK = 'https://pranaair.com/img/prana-air-logo.webp';

export default function BlogImage({ post, className, style }) {
  const getInitialSrc = () => {
    if (!post?.featuredImage) return FALLBACK;

    let img = post.featuredImage;

    if (img.includes('wp-content/uploads/')) {
      const match = img.match(/wp-content\/uploads\/.*/);
      if (match) img = '/' + match[0];
    } else {
      img = img.replace(/(https?:\/\/)?(www\.)?dev\.pranaair\.com\/?(?:test-blog\/|blog\/)?/gi, '/');
    }

    if (img.startsWith('http')) {
      return img;
    }

    let cleanImg = img.startsWith('/') ? img : '/' + img;
    if (!cleanImg.startsWith('/cms/') && !cleanImg.startsWith('/wp-content/')) { cleanImg = '/cms' + cleanImg; }
    cleanImg = cleanImg.replace(/^\/(test-blog|blog|pranaair-cms)\//, '/');

    const domain = process.env.NEXT_PUBLIC_DOMAIN;

    if (cleanImg.includes('/wp-content/uploads/')) {
      if (domain) {
        return `${domain.replace(/\/cms\/?$/, '')}/blog${cleanImg}`;
      }
      if (process.env.NODE_ENV !== 'development') {
        return `https://www.pranaair.com/blog${cleanImg}`;
      } else {
        return `http://localhost:3000${cleanImg}`;
      }
    }

    if (domain && !cleanImg.startsWith('http')) {
      const base = domain.replace(/\/+$/, '');
      const path = cleanImg.startsWith('/') ? cleanImg : `/${cleanImg}`;
      return `${base}${path}`;
    }

    return cleanImg;
  };

  const [src, setSrc] = useState(getInitialSrc);

  useEffect(() => {
    setSrc(getInitialSrc());
  }, [post]);

  const handleError = () => setSrc(FALLBACK);

  if (src === FALLBACK) {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          overflow: 'hidden'
        }}
      >
        <img
          src={src}
          alt={post?.title || 'Prana Air'}
          style={{ width: '80%', height: '80%', objectFit: 'contain' }}
        />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={post?.title || 'Blog post image'}
      className={className}
      style={style}
      onError={handleError}
    />
  );
}
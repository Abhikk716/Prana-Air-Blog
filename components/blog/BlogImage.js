"use client";
import React, { useState, useEffect } from 'react';

const FALLBACK = 'https://pranaair.com/img/prana-air-logo.webp';

export default function BlogImage({ post, className, style }) {
  const getInitialSrc = () => {
    if (!post?.featuredImage) return FALLBACK;

    let img = post.featuredImage;

    // Local imported WordPress images from public/wp-content/uploads
    if (img.includes('wp-content/uploads/')) {
      const match = img.match(/wp-content\/uploads\/.*/);
      if (match) return '/cms/' + match[0];
    }

    // Local new CMS uploads from public/uploads or upload server
    if (img.includes('uploads/')) {
      const match = img.match(/uploads\/.*/);
      if (match) return '/cms/' + match[0];
    }

    if (img.startsWith('http')) return img;

    let cleanImg = img.startsWith('/') ? img : '/' + img;
    if (!cleanImg.startsWith('/cms/')) {
      cleanImg = '/cms' + cleanImg;
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

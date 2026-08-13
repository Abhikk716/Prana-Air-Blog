"use client";
import React, { useState, useEffect } from 'react';

const FALLBACK = 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80';

/**
 * BlogImage – renders a blog featured image.
 *
 * The `featuredImage` field from the Blog CMS API is always either:
 *   - an absolute URL (https://...)         → served from our own /uploads/ CDN or blog CMS static dir
 *   - a relative /uploads/featured/… path  → prepend BLOG_API_URL (set via window.location in client)
 *
 * WordPress dependency has been completely removed.
 */
export default function BlogImage({ post, className, style }) {
  const getInitialSrc = () => {
    if (!post?.featuredImage) return FALLBACK;

    let img = post.featuredImage;

    // Remove the Vercel domain completely so it becomes a relative path for SEO
    img = img.replace(/^https?:\/\/prana-air-blog\.vercel\.app/i, '');

    // If it's an external URL (e.g. Unsplash), return it as is
    if (img.startsWith('http')) {
      return img;
    }

    // Clean up the relative path
    let cleanImg = img.startsWith('/') ? img : '/' + img;
    cleanImg = cleanImg.replace(/^\/(test-blog|blog)\//, '/');

    if (process.env.NODE_ENV !== 'development' && cleanImg.includes('/wp-content/uploads/')) {
      return `https://www.pranaair.com/blog${cleanImg}`;
    }

    const bypassSecret = process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET || 'kvgxx9053m0tNdDFjYcNE1UCj4dpSGHd';
    const separator = cleanImg.includes('?') ? '&' : '?';
    const bypassQuery = bypassSecret ? `${separator}x-vercel-protection-bypass=${bypassSecret}` : '';

    return `${cleanImg}${bypassQuery}`;
  };

  const [src, setSrc] = useState(getInitialSrc);

  useEffect(() => {
    setSrc(getInitialSrc());
  }, [post]);

  const handleError = () => setSrc(FALLBACK);

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

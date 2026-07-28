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

    const img = post.featuredImage;

    // Already an absolute URL – use as-is (covers our local /uploads CDN or any external URL)
    if (img.startsWith('http')) {
      const bypassSecret = process.env.NEXT_PUBLIC_VERCEL_BYPASS_SECRET || 'kvgxx9053m0tNdDFjYcNE1UCj4dpSGHd';
      if (bypassSecret && img.includes('prana-air-blog.vercel.app')) {
        const separator = img.includes('?') ? '&' : '?';
        return `${img}${separator}x-vercel-protection-bypass=${bypassSecret}`;
      }
      return img;
    }

    // Relative path from Blog CMS uploads – prefix the CMS origin
    // In production replace with your deployed blog CMS domain
    const cmsOrigin = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_BLOG_API_URL || 'https://prana-air-blog.vercel.app')
      : (process.env.BLOG_API_URL || 'https://prana-air-blog.vercel.app');

    // Strip out /test-blog/ or /blog/ prefix for the local CMS server since it serves from /
    let cleanImg = img.startsWith('/') ? img : '/' + img;
    cleanImg = cleanImg.replace(/^\/(test-blog|blog)\//, '/');

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

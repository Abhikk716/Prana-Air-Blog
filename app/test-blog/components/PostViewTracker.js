'use client';
import { useEffect } from 'react';

export default function PostViewTracker({ post }) {
  useEffect(() => {
    if (!post || !post.slug) return;

    try {
      const viewsData = JSON.parse(localStorage.getItem('prana_blog_views') || '{}');
      const slug = post.slug;

      if (!viewsData[slug]) {
        viewsData[slug] = {
          views: 0,
          title: post.title,
          slug: post.slug,
          image: post.featuredImage || '',
          date: post.publishedAt || ''
        };
      }

      viewsData[slug].views += 1;
      localStorage.setItem('prana_blog_views', JSON.stringify(viewsData));
    } catch (e) {
      console.error('Error tracking post views', e);
    }
  }, [post]);

  return null;
}

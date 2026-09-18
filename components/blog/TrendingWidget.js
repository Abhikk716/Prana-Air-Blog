'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TrendingWidget({ lang = 'en', title = 'Trending Articles', fallbackPosts = [] }) {
  const [displayPosts, setDisplayPosts] = useState([]);

  useEffect(() => {
    try {
      const viewsData = JSON.parse(localStorage.getItem('prana_blog_views') || '{}');
      const trending = Object.values(viewsData)
        .filter(post => post.views >= 2)
        .sort((a, b) => b.views - a.views)
        .slice(0, 4);

      if (trending.length > 0) {
        setDisplayPosts(trending);
      } else if (fallbackPosts && fallbackPosts.length > 0) {
        setDisplayPosts(fallbackPosts.slice(0, 4).map(p => ({
          slug: p.slug,
          title: p.title,
          image: p.featuredImage || '',
          date: p.publishedAt || ''
        })));
      }
    } catch (e) {
      if (fallbackPosts && fallbackPosts.length > 0) {
        setDisplayPosts(fallbackPosts.slice(0, 4).map(p => ({
          slug: p.slug,
          title: p.title,
          image: p.featuredImage || '',
          date: p.publishedAt || ''
        })));
      }
    }
  }, [fallbackPosts]);

  if (!displayPosts || displayPosts.length === 0) return null;

  const cmsSlug = process.env.NEXT_PUBLIC_CMS_SLUG || 'pranaair-cms';
  const getPostUrl = (slug) => `/${cmsSlug}/preview?slug=${encodeURIComponent(slug)}`;

  const cleanImageUrl = (img) => {
    if (!img) return '/uploads/featured/placeholder.jpg';
    if (img.startsWith('http')) return img;
    if (img.includes('wp-content/uploads/')) {
      const match = img.match(/wp-content\/uploads\/.*/);
      if (match) return '/' + match[0];
    }
    return img.startsWith('/') ? img : `/${img}`;
  };

  return (
    <div className="sidebar-widget">
      <h4 className="widget-title">{title}</h4>
      <div className="popular-posts-list">
        {displayPosts.map((post, idx) => (
          <div key={post.slug || idx} className="sidebar-post-item">
            <Link href={getPostUrl(post.slug)} className="sidebar-post-thumb-wrap">
              <img 
                src={cleanImageUrl(post.image)} 
                alt={post.title}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </Link>
            <div className="sidebar-post-item-content">
              <Link href={getPostUrl(post.slug)} className="sidebar-post-title">
                {post.title}
              </Link>
              <div className="sidebar-post-meta">
                {post.date && (
                  <span>
                    {new Date(post.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                )}
                {post.views ? (
                  <span className="sidebar-post-views">
                    · {post.views} views
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

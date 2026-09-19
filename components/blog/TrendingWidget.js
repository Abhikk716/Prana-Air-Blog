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
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    let path = img;
    if (path.includes('wp-content/uploads/')) {
      const match = path.match(/wp-content\/uploads\/.*/);
      if (match) path = '/' + match[0];
    }
    let cleanImg = path.startsWith('/') ? path : `/${path}`;
    
    // Ensure all local images are served with the /cms basePath
    if (!cleanImg.startsWith('/cms/')) {
      cleanImg = `/cms${cleanImg}`;
    }
    cleanImg = cleanImg.replace(/^\/cms\/(test-blog|blog|pranaair-cms)\//, '/cms/');

    if (process.env.NEXT_PUBLIC_DOMAIN) {
      const base = process.env.NEXT_PUBLIC_DOMAIN.replace(/\/+$/, '');
      const basePath = cleanImg.startsWith('/') ? cleanImg : `/${cleanImg}`;
      return `${base}${basePath}`;
    }
    return cleanImg;
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
              <div className="sidebar-post-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>
                {post.date && (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>
                      {new Date(post.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '1.25rem' }}>
        <Link href={`/${cmsSlug}/dashboard`} style={{ color: '#69b454', fontSize: '0.85rem', fontWeight: '600', textDecoration: 'none' }}>
          All Articles &rarr;
        </Link>
      </div>
    </div>
  );
}

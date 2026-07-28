'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TrendingWidget({ lang, title }) {
  const [trendingPosts, setTrendingPosts] = useState([]);

  useEffect(() => {
    try {
      const viewsData = JSON.parse(localStorage.getItem('prana_blog_views') || '{}');
      // Filter posts with views >= 4
      const trending = Object.values(viewsData)
        .filter(post => post.views >= 4)
        .sort((a, b) => b.views - a.views)
        .slice(0, 3); // top 3
      
      setTrendingPosts(trending);
    } catch (e) {
      console.error('Error reading trending posts', e);
    }
  }, []);

  if (trendingPosts.length === 0) return null;

  const getPostUrl = (slug) => lang === 'en' ? `/test-blog/${slug}/` : `/${lang}/test-blog/${slug}/`;

  return (
    <div className="sidebar-widget">
      <h4 className="widget-title">{title || 'Trending Articles'}</h4>
      <div className="popular-posts-list">
        {trendingPosts.map((post) => (
          <div key={post.slug} className="sidebar-post-item">
            {post.image && (
              <img 
                src={post.image.startsWith('http') ? post.image : `/test-blog${post.image.startsWith('/') ? post.image : `/${post.image}`}`} 
                alt={post.title}
              />
            )}
            <div className="sidebar-post-item-content">
              <Link href={getPostUrl(post.slug)} className="sidebar-post-title">
                {post.title}
              </Link>
              <div className="sidebar-post-meta">
                {post.date && <span>{new Date(post.date).toLocaleDateString()}</span>}
                <span className="sidebar-post-views">
                  {post.views} views
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

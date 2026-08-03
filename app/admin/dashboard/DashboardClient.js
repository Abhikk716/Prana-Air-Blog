'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

export default function DashboardClient({ initialPosts, categories = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [loadingId, setLoadingId] = useState(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'analytics';
  
  const [activeTab, setActiveTab] = useState(tabParam);

  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'analytics');
  }, [searchParams]);

  // Handle post deletion
  const handleDelete = async (postId, postTitle) => {
    if (!confirm(`Are you sure you want to delete the post: "${postTitle}"?`)) {
      return;
    }

    setLoadingId(postId);

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setPosts(posts.filter((p) => p._id !== postId));
        alert('Post deleted successfully.');
      } else {
        alert(data.error || 'Failed to delete post.');
      }
    } catch (err) {
      console.error(err);
      alert('A network error occurred while deleting the post.');
    } finally {
      setLoadingId(null);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      const res = await fetch('/api/admin/logout', {
        method: 'POST',
      });

      if (res.ok) {
        router.push('/admin/login');
        router.refresh();
      } else {
        alert('Failed to log out.');
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during logout.');
    } finally {
      setLogoutLoading(false);
    }
  };

  // Filter posts based on search, status, and category
  let filteredPosts = posts.filter((post) => {
    const matchesSearch =
      post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.author?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || post.status === statusFilter;

    const matchesCategory =
      categoryFilter === 'all' ||
      (post.categories && post.categories.includes(categoryFilter));

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Sort posts dynamically
  filteredPosts = [...filteredPosts].sort((a, b) => {
    const dateA = new Date(a.publishedAt || a.createdAt);
    const dateB = new Date(b.publishedAt || b.createdAt);
    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // Format Date helper
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="dashboard-container">
      {/* Dashboard Top Header */}
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#1f2937' }}>
            {activeTab === 'analytics' ? 'Analytics' : 'CMS Dashboard'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {activeTab === 'analytics' 
              ? 'Track your blog performance, views, and banner clicks.'
              : 'Manage your blog posts, draft articles, and track SEO metrics.'
            }
          </p>
        </div>
        
        {activeTab === 'posts' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <a
              href="/admin/editor"
              style={{
                padding: '0.6rem 1.25rem',
                background: 'linear-gradient(135deg, #74b75c, #5e9e48)',
                color: 'white',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.9rem',
                boxShadow: '0 4px 10px rgba(116, 183, 92, 0.25)',
                textDecoration: 'none'
              }}
            >
              + Create New Post
            </a>
          </div>
        )}
      </div>

      {activeTab === 'posts' && (
        <>
          {/* Filter and Search Controls */}
      <div className="dashboard-filters">
        <input
          type="text"
          placeholder="Search by title or author..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flexGrow: 1,
            maxWidth: '400px',
            padding: '0.75rem 1rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#1f2937',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#1f2937',
            fontSize: '0.9rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#1f2937',
            fontSize: '0.9rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="all">All Categories</option>
          {categories.map((cat, i) => (
            <option key={i} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#1f2937',
            fontSize: '0.9rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
        </select>

        <div className="dashboard-filter-count">
          Showing {filteredPosts.length} of {posts.length} posts
        </div>
      </div>

      {/* Posts Table List */}
      <div className="dashboard-table-container">
        {filteredPosts.length > 0 ? (
          <table className="dashboard-table">
            <thead>
              <tr style={{
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
              }}>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Title</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Author</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post) => (
                <tr
                  key={post._id}
                  style={{
                    borderBottom: '1px solid #e5e7eb',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#faf8f5';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600 }}>
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      style={{ color: '#1f2937', textDecoration: 'none', display: 'block', marginBottom: '0.35rem' }}
                      onMouseOver={(e) => e.target.style.color = '#74b75c'}
                      onMouseOut={(e) => e.target.style.color = '#1f2937'}
                    >
                      {post.title}
                    </a>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', backgroundColor: '#e2e8f0', color: '#475569', fontWeight: 700 }}>EN</span>
                      {['hi', 'es', 'de', 'fr', 'ru', 'ja'].map(langCode => {
                        const hasTranslation = post.translations && (post.translations[langCode] || (post.translations.get && post.translations.get(langCode)));
                        if (!hasTranslation) return null;
                        return (
                          <span key={langCode} style={{
                            fontSize: '0.65rem',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            backgroundColor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {langCode}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: '#4b5563' }}>
                    {post.author || 'Admin'}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
                    {formatDate(post.publishedAt || post.createdAt)}
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      backgroundColor: post.status === 'published' ? '#dcfce7' : '#fef3c7',
                      color: post.status === 'published' ? '#15803d' : '#d97706',
                    }}>
                      {post.status}
                    </span>
                  </td>
                  <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <a
                        href={`/admin/editor?id=${post._id}`}
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#2563eb',
                        }}
                        onMouseOver={(e) => e.target.style.color = '#1d4ed8'}
                        onMouseOut={(e) => e.target.style.color = '#2563eb'}
                      >
                        Edit
                      </a>
                      <a
                        href={`/test-blog/${post.slug}`}
                        target="_blank"
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: '#0891b2',
                        }}
                        onMouseOver={(e) => e.target.style.color = '#0e7490'}
                        onMouseOut={(e) => e.target.style.color = '#0891b2'}
                      >
                        Preview
                      </a>
                      <button
                        onClick={() => handleDelete(post._id, post.title)}
                        disabled={loadingId === post._id}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          outline: 'none',
                        }}
                        onMouseOver={(e) => e.target.style.color = '#b91c1c'}
                        onMouseOut={(e) => e.target.style.color = '#dc2626'}
                      >
                        {loadingId === post._id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#6b7280' }}>
            <p>No blog posts found. Click "+ Create New Post" to write your first article!</p>
          </div>
        )}
      </div>
      </>
      )}

      {activeTab === 'analytics' && (
        <div style={{ padding: '1rem 0' }}>
          {(() => {
            const totalViews = posts.reduce((sum, post) => sum + (post.analytics?.views || 0), 0);
            const totalClicks = posts.reduce((sum, post) => sum + (post.analytics?.promotionClicks || 0), 0);
            const totalCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';
            const publishedCount = posts.filter(p => p.status === 'published').length;

            // Aggregate language data with all supported languages pre-filled
            const supportedLangs = ['en', 'hi', 'es', 'de', 'fr', 'ru', 'ja'];
            const langViews = supportedLangs.reduce((acc, lang) => {
              acc[lang] = 0;
              return acc;
            }, {});

            posts.forEach(post => {
              if (post.analytics?.viewsByLang) {
                Object.entries(post.analytics.viewsByLang).forEach(([lang, views]) => {
                  if (langViews[lang] !== undefined) {
                    langViews[lang] += views;
                  }
                });
              }
            });
            
            const chartData = supportedLangs.map(lang => ({
              name: lang.toUpperCase(),
              views: langViews[lang]
            }));

            const colors = ['#74b75c', '#0891b2', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

            return (
              <>
                <div className="analytics-grid">
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Views</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>
                      {totalViews.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Banner Clicks</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#74b75c' }}>
                      {totalClicks.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '2px solid rgba(116, 183, 92, 0.2)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(116, 183, 92, 0.1)' }}>
                    <div style={{ color: '#74b75c', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Average CTR %</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>
                      {totalCTR}%
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Published Posts</div>
                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>
                      {publishedCount}
                    </div>
                  </div>
                </div>

                {chartData.length > 0 && (
                  <div style={{ marginBottom: '3rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Audience Insights (Views by Language)</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Discover which languages are driving the most traffic to your content.</p>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem 1rem 1rem 1rem', height: '350px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
                          <Tooltip 
                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontWeight: 600 }} 
                            formatter={(value) => [`${value} Views`, 'Views']}
                          />
                          <Bar dataKey="views" radius={[8, 8, 0, 0]} barSize={25} animationDuration={1000}>
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.views > 0 ? '#74b75c' : '#e5e7eb'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '1rem' }}>Top Performing Posts</h3>
                <div className="dashboard-table-container">
                  <table className="dashboard-table">
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Post Title</th>
                        <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Views</th>
                        <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Banner Clicks</th>
                        <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>CTR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...posts]
                        .sort((a, b) => (b.analytics?.views || 0) - (a.analytics?.views || 0))
                        .slice(0, 10)
                        .map(post => {
                          const v = post.analytics?.views || 0;
                          const c = post.analytics?.promotionClicks || 0;
                          const ctr = v > 0 ? ((c / v) * 100).toFixed(1) : '0.0';
                          const isHighCTR = parseFloat(ctr) > 10.0;
                          
                          return (
                            <tr key={post._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                              <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937' }}>
                                <a href={`/admin/editor?id=${post._id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                  {post.title}
                                </a>
                              </td>
                              <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>
                                {v.toLocaleString()}
                              </td>
                              <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>
                                {c.toLocaleString()}
                              </td>
                              <td style={{ padding: '1rem', color: isHighCTR ? '#15803d' : '#4b5563', fontWeight: isHighCTR ? 700 : 500, backgroundColor: isHighCTR ? 'rgba(34, 197, 94, 0.1)' : 'transparent' }}>
                                {ctr}%
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

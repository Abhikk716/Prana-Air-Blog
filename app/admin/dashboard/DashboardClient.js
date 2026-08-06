'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, PieChart, Pie, Legend } from 'recharts';

export default function DashboardClient({ initialPosts, categories = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  
  // Analytics filters & state
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState('all');
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState('all');
  const [dailyData, setDailyData] = useState([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [loadingId, setLoadingId] = useState(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') || 'analytics';
  
  const [activeTab, setActiveTab] = useState(tabParam);

  useEffect(() => {
    setActiveTab(searchParams.get('tab') || 'analytics');
  }, [searchParams]);

  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Fetch daily analytics when time filter changes
  useEffect(() => {
    if (analyticsTimeFilter === 'all') {
      setDailyData([]);
      return;
    }
    
    // Don't fetch if custom is selected but dates aren't filled
    if (analyticsTimeFilter === 'custom' && (!customStartDate || !customEndDate)) {
      return;
    }

    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      try {
        let start = new Date();
        let end = new Date();
        
        if (analyticsTimeFilter === '7d') {
          start.setDate(start.getDate() - 7);
        } else if (analyticsTimeFilter === '30d') {
          start.setDate(start.getDate() - 30);
        } else if (analyticsTimeFilter === 'this_month') {
          start.setDate(1); // First of the month
        } else if (analyticsTimeFilter === 'custom') {
          start = new Date(customStartDate);
          end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999); // Include the whole end day
        }

        const res = await fetch(`/api/admin/analytics?startDate=${start.toISOString()}&endDate=${end.toISOString()}`);
        const result = await res.json();
        if (result.success) {
          setDailyData(result.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch analytics', err);
      } finally {
        setLoadingAnalytics(false);
      }
    };

    fetchAnalytics();
  }, [analyticsTimeFilter, customStartDate, customEndDate]);

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

  filteredPosts = [...filteredPosts].sort((a, b) => {
    const dateA = new Date(a.publishedAt || a.createdAt);
    const dateB = new Date(b.publishedAt || b.createdAt);
    return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Compute analytics data based on filters
  const { metrics, langChartData, categoryChartData, timeChartData, topPosts } = useMemo(() => {
    const supportedLangs = ['en', 'hi', 'es', 'de', 'fr', 'ru', 'ja'];
    let totalViews = 0;
    let totalClicks = 0;
    const langViews = supportedLangs.reduce((acc, lang) => ({ ...acc, [lang]: 0 }), {});
    const catViews = {};
    const timeViewsMap = {};
    const postViewsMap = {};

    if (analyticsTimeFilter === 'all') {
      // Use initialPosts data
      posts.forEach(post => {
        if (analyticsCategoryFilter !== 'all' && (!post.categories || !post.categories.includes(analyticsCategoryFilter))) {
          return; // Skip if category doesn't match
        }

        const v = post.analytics?.views || 0;
        const c = post.analytics?.promotionClicks || 0;
        totalViews += v;
        totalClicks += c;

        if (post.analytics?.viewsByLang) {
          Object.entries(post.analytics.viewsByLang).forEach(([lang, views]) => {
            if (langViews[lang] !== undefined) langViews[lang] += views;
          });
        }

        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + v;
          });
        }

        postViewsMap[post._id] = { post, views: v, clicks: c };
      });
    } else {
      // Use dailyData
      dailyData.forEach(d => {
        const post = d.postId; // Populated post object
        if (!post) return;
        
        if (analyticsCategoryFilter !== 'all' && (!post.categories || !post.categories.includes(analyticsCategoryFilter))) {
          return;
        }

        totalViews += d.views || 0;
        totalClicks += d.promotionClicks || 0;

        if (d.viewsByLang) {
          Object.entries(d.viewsByLang).forEach(([lang, views]) => {
            if (langViews[lang] !== undefined) langViews[lang] += views;
          });
        }

        if (post.categories) {
          post.categories.forEach(cat => {
            catViews[cat] = (catViews[cat] || 0) + (d.views || 0);
          });
        }

        const dateStr = new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        timeViewsMap[dateStr] = (timeViewsMap[dateStr] || 0) + (d.views || 0);

        if (!postViewsMap[post._id]) {
          postViewsMap[post._id] = { post, views: 0, clicks: 0 };
        }
        postViewsMap[post._id].views += (d.views || 0);
        postViewsMap[post._id].clicks += (d.promotionClicks || 0);
      });
    }

    const totalCTR = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00';
    const publishedCount = posts.filter(p => p.status === 'published').length;

    const langChartData = supportedLangs.map(lang => ({
      name: lang.toUpperCase(),
      views: langViews[lang]
    }));

    const categoryChartData = Object.keys(catViews)
      .filter(cat => catViews[cat] > 0)
      .map(cat => ({
        name: cat,
        views: catViews[cat]
      })).sort((a, b) => b.views - a.views);

    const timeChartData = Object.keys(timeViewsMap).map(date => ({
      date,
      views: timeViewsMap[date]
    }));

    const topPosts = Object.values(postViewsMap)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    return {
      metrics: { totalViews, totalClicks, totalCTR, publishedCount },
      langChartData,
      categoryChartData,
      timeChartData,
      topPosts
    };
  }, [posts, dailyData, analyticsTimeFilter, analyticsCategoryFilter]);

  const COLORS = ['#74b75c', '#0891b2', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#10b981'];

  return (
    <div className="dashboard-container">
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
                <option key={i} value={cat}>{cat}</option>
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
          </div>

          <div className="dashboard-table-container">
            {filteredPosts.length > 0 ? (
              <table className="dashboard-table">
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Title</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Author</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPosts.map((post) => (
                    <tr key={post._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1.25rem 1.5rem', fontWeight: 600 }}>
                        <a href={`/blog/${post.slug}`} target="_blank" style={{ color: '#1f2937', textDecoration: 'none' }}>{post.title}</a>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#4b5563' }}>{post.author || 'Admin'}</td>
                      <td style={{ padding: '1.25rem 1.5rem', color: '#6b7280', fontSize: '0.85rem' }}>{formatDate(post.publishedAt || post.createdAt)}</td>
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', backgroundColor: post.status === 'published' ? '#dcfce7' : '#fef3c7', color: post.status === 'published' ? '#15803d' : '#d97706' }}>
                          {post.status}
                        </span>
                      </td>
                      <td style={{ padding: '1.25rem 1.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                          <a href={`/admin/editor?id=${post._id}`} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2563eb' }}>Edit</a>
                          <button onClick={() => handleDelete(post._id, post.title)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#6b7280' }}>
                <p>No blog posts found.</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <div style={{ padding: '1rem 0' }}>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Time Range</label>
              <select
                value={analyticsTimeFilter}
                onChange={(e) => setAnalyticsTimeFilter(e.target.value)}
                style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none' }}
              >
                <option value="all">All Time</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>
            
            {analyticsTimeFilter === 'custom' && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Start</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>End</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Category</label>
              <select
                value={analyticsCategoryFilter}
                onChange={(e) => setAnalyticsCategoryFilter(e.target.value)}
                style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none' }}
              >
                <option value="all">All Categories</option>
                {categories.map((cat, i) => (
                  <option key={i} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingAnalytics ? (
            <div style={{ padding: '4rem', textAlign: 'center', color: '#6b7280' }}>Loading analytics data...</div>
          ) : (
            <>
              <div className="analytics-grid">
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Views</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>{metrics.totalViews.toLocaleString()}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Banner Clicks</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#74b75c' }}>{metrics.totalClicks.toLocaleString()}</div>
                </div>
                <div style={{ background: '#fff', border: '2px solid rgba(116, 183, 92, 0.2)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(116, 183, 92, 0.1)' }}>
                  <div style={{ color: '#74b75c', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Average CTR %</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>{metrics.totalCTR}%</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.9rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Published Posts</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#1f2937' }}>{metrics.publishedCount}</div>
                </div>
              </div>

              {analyticsTimeFilter !== 'all' && timeChartData.length > 0 && (
                <div style={{ marginBottom: '3rem', marginTop: '3rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views Over Time</h3>
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem 1rem 1rem 1rem', height: '350px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeChartData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontWeight: 600 }} 
                        />
                        <Line type="monotone" dataKey="views" stroke="#74b75c" strokeWidth={3} dot={{ r: 4, fill: '#74b75c', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '3rem', marginTop: '3rem' }}>
                {categoryChartData.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views by Category</h3>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem 1rem 1rem 1rem', height: '350px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="views"
                            // Removed label to prevent overlap
                          >
                            {categoryChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {langChartData.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views by Language</h3>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem 1rem 1rem 1rem', height: '350px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={langChartData} margin={{ top: 20, right: 30, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 600 }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
                          <Tooltip 
                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', fontWeight: 600 }} 
                          />
                          <Bar dataKey="views" radius={[8, 8, 0, 0]} barSize={25}>
                            {langChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.views > 0 ? '#0891b2' : '#e5e7eb'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

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
                    {topPosts.map(({ post, views, clicks }) => {
                      const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
                      const isHighCTR = parseFloat(ctr) > 10.0;
                      
                      return (
                        <tr key={post._id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937' }}>
                            <a href={`/admin/editor?id=${post._id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {post.title}
                            </a>
                          </td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>
                            {views.toLocaleString()}
                          </td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>
                            {clicks.toLocaleString()}
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
          )}
        </div>
      )}
    </div>
  );
}

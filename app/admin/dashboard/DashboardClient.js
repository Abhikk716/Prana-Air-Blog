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
  const [dateFilter, setDateFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');

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

  const [bannerSettings, setBannerSettings] = useState([]);
  const [loadingBanners, setLoadingBanners] = useState(false);
  const [editingBanner, setEditingBanner] = useState({
    type: 'global',
    category: '',
    promotion: { imageUrl: '', text: '', link: '', placement: 'sidebar', endDate: '', isActive: false }
  });

  const [activeBannerTab, setActiveBannerTab] = useState('global');

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    setLoadingBanners(true);
    try {
      const res = await fetch('/api/admin/banners');
      const data = await res.json();
      if (data.success) {
        setBannerSettings(data.banners);
        loadBannerToEdit('global', data.banners);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBanners(false);
    }
  };

  const handleBannerImageUpload = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
          const data = await res.json();
          if (res.ok) {
            setEditingBanner(prev => ({
              ...prev,
              promotion: {
                ...prev.promotion,
                imageUrl: data.url
              }
            }));
          } else {
            alert(data.error || 'Upload failed.');
          }
        } catch (err) {
          alert('Network error during upload.');
        }
      }
    };
    input.click();
  };

  const handleSaveBanner = async () => {
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingBanner)
      });
      const data = await res.json();
      if (data.success) {
        alert('Banner saved successfully');
        fetchBanners();
      } else {
        alert(data.error || 'Failed to save banner');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const loadBannerToEdit = (id, banners = bannerSettings) => {
    setActiveBannerTab(id);
    if (id === 'global') {
      const existing = banners.find(b => b.type === 'global');
      if (existing) {
        setEditingBanner(existing);
      } else {
        setEditingBanner({
          type: 'global',
          promotion: { imageUrl: '', text: '', link: '', placement: 'sidebar', endDate: '', isActive: false }
        });
      }
    } else if (id === 'new') {
      setEditingBanner({
        type: 'category',
        name: 'New Campaign',
        categories: [],
        promotion: { imageUrl: '', text: '', link: '', placement: 'sidebar', endDate: '', isActive: false }
      });
    } else {
      const existing = banners.find(b => b._id === id);
      if (existing) {
        setEditingBanner(existing);
      }
    }
  };

  const handleBannerDelete = async () => {
    if (!editingBanner._id || editingBanner.type === 'global') return;
    if (!confirm('Are you sure you want to delete this banner campaign?')) return;

    try {
      const res = await fetch('/api/admin/banners?id=' + editingBanner._id, { method: 'DELETE' });
      if (res.ok) {
        fetchBanners();
        setActiveBannerTab('global');
      } else {
        alert('Failed to delete banner');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  const handleCategoryCheckbox = (cat) => {
    setEditingBanner(prev => {
      const currentCats = prev.categories || [];
      if (currentCats.includes(cat)) {
        return { ...prev, categories: currentCats.filter(c => c !== cat) };
      } else {
        return { ...prev, categories: [...currentCats, cat] };
      }
    });
  };

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
      
    let matchesDate = true;
    if (dateFilter) {
      const postDate = new Date(post.publishedAt || post.createdAt).toISOString().split('T')[0];
      matchesDate = postDate.startsWith(dateFilter);
    }

    let matchesLanguage = true;
    if (languageFilter !== 'all') {
      matchesLanguage = post.translations && post.translations[languageFilter];
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesDate && matchesLanguage;
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
  const { metrics, langChartData, categoryChartData, timeChartData, topPosts, campaignPerformance } = useMemo(() => {
    const supportedLangs = ['en', 'in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'hi', 'fr', 'de', 'es', 'ru', 'ja', 'pt-PT'];
    let totalViews = 0;
    let totalClicks = 0;
    const langViews = supportedLangs.reduce((acc, lang) => ({ ...acc, [lang]: 0 }), {});
    const catViews = {};
    const timeViewsMap = {};
    const postViewsMap = {};

    const campaignStats = {};
    if (bannerSettings && bannerSettings.length > 0) {
      bannerSettings.forEach(b => {
        const id = b.type === 'global' ? 'global' : b._id;
        campaignStats[id] = {
          name: b.type === 'global' ? 'Global Banner' : (b.name || 'Unnamed Campaign'),
          views: 0,
          clicks: 0
        };
      });
    }

    // `requireCurrentlyActive` gates on the banner's live isActive/endDate state.
    // We only have the CURRENT banner config (no historical log of which campaign
    // was live on a given past day), so for "all time" totals we attribute using
    // today's active campaign, but for a historical date range we relax that gate
    // — otherwise a campaign that has since ended would silently lose all of its
    // past clicks/views instead of being reported under its own name.
    const getBannerForPost = (post, requireCurrentlyActive) => {
      const isLive = (promotion) => !requireCurrentlyActive || (promotion?.isActive && new Date(promotion.endDate) >= new Date());

      if (post.promotion && isLive(post.promotion)) {
        return null; // Post specific
      }
      if (post.categories && post.categories.length > 0) {
        for (const cat of post.categories) {
          const catBanner = bannerSettings.find(b => b.type === 'category' && b.categories?.includes(cat) && isLive(b.promotion));
          if (catBanner) {
            return catBanner._id;
          }
        }
      }
      const global = bannerSettings.find(b => b.type === 'global' && isLive(b.promotion));
      if (global) {
        return 'global';
      }
      return null;
    };

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

        const bannerId = getBannerForPost(post, true);
        if (bannerId && campaignStats[bannerId]) {
          campaignStats[bannerId].views += v;
          campaignStats[bannerId].clicks += c;
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

        const bannerId = getBannerForPost(post, false);
        if (bannerId && campaignStats[bannerId]) {
          campaignStats[bannerId].views += (d.views || 0);
          campaignStats[bannerId].clicks += (d.promotionClicks || 0);
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

    const campaignPerformance = Object.values(campaignStats)
      .filter(c => c.views > 0 || c.clicks > 0)
      .sort((a, b) => b.views - a.views);

    return {
      metrics: { totalViews, totalClicks, totalCTR, publishedCount },
      langChartData,
      categoryChartData,
      timeChartData,
      topPosts,
      campaignPerformance
    };
  }, [posts, dailyData, analyticsTimeFilter, analyticsCategoryFilter, bannerSettings]);

  const COLORS = ['#74b75c', '#0891b2', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#10b981'];

  const TAB_META = {
    analytics: { title: 'Analytics', subtitle: 'Track your blog performance, views, and banner clicks.' },
    posts: { title: 'CMS Dashboard', subtitle: 'Manage your blog posts, draft articles, and track SEO metrics.' },
    banners: { title: 'Banner Campaigns', subtitle: 'Configure global and category-targeted promotion banners.' },
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#1f2937' }}>
            {TAB_META[activeTab]?.title || 'CMS Dashboard'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            {TAB_META[activeTab]?.subtitle || ''}
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
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
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
              <option value="all">All Languages</option>
              {['en', 'in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'hi', 'fr', 'de', 'es', 'ru', 'ja', 'pt-PT'].map(lang => (
                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
              ))}
            </select>

            <input
              type={dateFilter ? "month" : "text"}
              placeholder="Filter by Month"
              onFocus={(e) => (e.target.type = "month")}
              onBlur={(e) => { if (!dateFilter) e.target.type = "text"; }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
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

          <div className="dashboard-table-container" style={{ borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
            {filteredPosts.length > 0 ? (
              <table className="dashboard-table">
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Title</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Author</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '1rem 1.5rem', fontSize: '0.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Translations</th>
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
                      <td style={{ padding: '1.25rem 1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                          {post.translations && Object.keys(post.translations).length > 0 ? (
                            Object.keys(post.translations).map(lang => (
                              <span key={lang} style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', textTransform: 'uppercase' }}>
                                {lang}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>None</span>
                          )}
                        </div>
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
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '0.5rem' }}>Total Views</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.025em' }}>{metrics.totalViews.toLocaleString()}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '0.5rem' }}>Banner Clicks</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#74b75c', letterSpacing: '-0.025em' }}>{metrics.totalClicks.toLocaleString()}</div>
                </div>
                <div style={{ background: 'linear-gradient(to bottom right, #ffffff, #f0fdf4)', border: '2px solid rgba(116, 183, 92, 0.3)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 12px rgba(116, 183, 92, 0.15)', transition: 'transform 0.2s ease', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <div style={{ color: '#15803d', fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '0.5rem' }}>Average CTR %</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#14532d', letterSpacing: '-0.025em' }}>{metrics.totalCTR}%</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '1.5rem', textAlign: 'center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', transition: 'transform 0.2s ease, box-shadow 0.2s ease', cursor: 'default' }} onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)' }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>
                  <div style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em', marginBottom: '0.5rem' }}>Published Posts</div>
                  <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.025em' }}>{metrics.publishedCount}</div>
                </div>
              </div>

              {analyticsTimeFilter !== 'all' && timeChartData.length > 0 && (
                <div style={{ marginBottom: '3rem', marginTop: '3rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views Over Time</h3>
                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem 1rem 1rem 1rem', height: '380px', minWidth: 0, overflow: 'hidden' }}>
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

              <div className="charts-grid">
                {categoryChartData.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views by Category</h3>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '2rem 1.5rem 1rem 1.5rem', height: '380px', minWidth: 0, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)', transition: 'all 0.3s ease' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            cx="40%"
                            cy="50%"
                            innerRadius={75}
                            outerRadius={110}
                            paddingAngle={2}
                            minAngle={5}
                            dataKey="views"
                          >
                            {categoryChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                          />
                          <Legend 
                            layout="vertical" 
                            verticalAlign="middle" 
                            align="right" 
                            wrapperStyle={{ 
                              paddingLeft: '10px',
                              maxHeight: '320px',
                              overflowY: 'auto',
                              width: '45%',
                              fontSize: '12px'
                            }} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {langChartData.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', marginBottom: '0.5rem' }}>Views by Language</h3>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '2rem 1.5rem 1rem 1.5rem', height: '380px', minWidth: 0, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)', transition: 'all 0.3s ease' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={langChartData} margin={{ top: 20, right: 30, left: -10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 600 }}
                            dy={15}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} allowDecimals={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)', fontWeight: 600 }}
                          />
                          <Bar dataKey="views" radius={[6, 6, 0, 0]} barSize={8}>
                            {langChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.views > 0 ? 'url(#colorViews)' : '#e5e7eb'} />
                            ))}
                          </Bar>
                          <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#74b75c" stopOpacity={0.9} />
                              <stop offset="95%" stopColor="#74b75c" stopOpacity={0.7} />
                            </linearGradient>
                          </defs>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>

              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', marginBottom: '1.25rem', letterSpacing: '-0.025em' }}>Campaign Performance</h3>
              <div className="dashboard-table-container" style={{ marginBottom: '3rem', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                <table className="dashboard-table">
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Campaign Name</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Views</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>Banner Clicks</th>
                      <th style={{ padding: '1rem', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignPerformance.length > 0 ? campaignPerformance.map((campaign, i) => {
                      const ctr = campaign.views > 0 ? ((campaign.clicks / campaign.views) * 100).toFixed(1) : '0.0';
                      const isHighCTR = parseFloat(ctr) > 5.0;

                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '1rem', fontWeight: 600, color: '#1f2937' }}>{campaign.name}</td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>{campaign.views.toLocaleString()}</td>
                          <td style={{ padding: '1rem', color: '#4b5563', fontWeight: 500 }}>{campaign.clicks.toLocaleString()}</td>
                          <td style={{ padding: '1rem', color: isHighCTR ? '#15803d' : '#4b5563', fontWeight: isHighCTR ? 700 : 500, backgroundColor: isHighCTR ? 'rgba(34, 197, 94, 0.1)' : 'transparent' }}>
                            {ctr}%
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>No campaign data available for this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', marginBottom: '1.25rem', letterSpacing: '-0.025em' }}>Top Performing Posts</h3>
              <div className="dashboard-table-container" style={{ borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
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

      {activeTab === 'banners' && (
        <div style={{ padding: '1rem 0' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => loadBannerToEdit('global')}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === 'global' ? '#74b75c' : '#e5e7eb', color: activeBannerTab === 'global' ? 'white' : '#4b5563' }}
            >
              Global Banner
            </button>
            {bannerSettings.filter(b => b.type === 'category').map((banner) => (
              <button
                key={banner._id}
                onClick={() => loadBannerToEdit(banner._id)}
                style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer', backgroundColor: activeBannerTab === banner._id ? '#74b75c' : '#e5e7eb', color: activeBannerTab === banner._id ? 'white' : '#4b5563' }}
              >
                {banner.name || 'Unnamed Campaign'}
              </button>
            ))}
            <button
              onClick={() => loadBannerToEdit('new')}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: '1px dashed #74b75c', cursor: 'pointer', backgroundColor: activeBannerTab === 'new' ? '#74b75c' : 'transparent', color: activeBannerTab === 'new' ? 'white' : '#74b75c' }}
            >
              + Create Campaign
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                {editingBanner.type === 'global' ? 'Global Banner Settings' : (editingBanner._id ? 'Edit Campaign' : 'New Campaign')}
              </h3>
              {editingBanner.type === 'category' && editingBanner._id && (
                <button onClick={handleBannerDelete} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>Delete Campaign</button>
              )}
            </div>

            <div style={{ display: 'grid', gap: '1.5rem', maxWidth: '600px' }}>
              {editingBanner.type === 'category' && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Campaign Name</label>
                    <input
                      type="text"
                      value={editingBanner.name || ''}
                      onChange={e => setEditingBanner({ ...editingBanner, name: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                      placeholder="e.g. Summer Sale 2026"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Target Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb', maxHeight: '200px', overflowY: 'auto' }}>
                      {categories.map((cat, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="checkbox"
                            id={`cat-${i}`}
                            checked={(editingBanner.categories || []).includes(cat)}
                            onChange={() => handleCategoryCheckbox(cat)}
                          />
                          <label htmlFor={`cat-${i}`} style={{ fontSize: '0.9rem', color: '#4b5563' }}>{cat}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Image URL</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingBanner.promotion?.imageUrl || ''}
                    onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, imageUrl: e.target.value } })}
                    style={{ flexGrow: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    placeholder="https://..."
                  />
                  <button
                    onClick={handleBannerImageUpload}
                    style={{ padding: '0.75rem 1.25rem', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    Upload
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Promotion Text</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.text || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, text: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="Get 20% off..."
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Destination Link</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.link || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, link: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  placeholder="https://..."
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>Placement</label>
                <select
                  value={editingBanner.promotion?.placement || 'sidebar'}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, placement: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', outline: 'none' }}
                >
                  <option value="sidebar">Sidebar</option>
                  <option value="post_top">Inside Post (Top)</option>
                  <option value="post_bottom">Inside Post (Bottom)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}>End Date</label>
                <input
                  type="date"
                  value={editingBanner.promotion?.endDate ? new Date(editingBanner.promotion.endDate).toISOString().split('T')[0] : ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, endDate: e.target.value } })}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editingBanner.promotion?.isActive || false}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, isActive: e.target.checked } })}
                  style={{ width: '1.25rem', height: '1.25rem' }}
                />
                <label htmlFor="isActive" style={{ fontWeight: 600, color: '#4b5563' }}>Enable this banner</label>
              </div>

              <button
                onClick={handleSaveBanner}
                style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: '#74b75c', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '1rem' }}
              >
                Save Banner
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

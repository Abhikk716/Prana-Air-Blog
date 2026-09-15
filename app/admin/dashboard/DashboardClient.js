'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AnalyticsTab from './AnalyticsTab';
import { ALL_LANGUAGES, LANGUAGE_ROWS, decodeEntities, PostThumb } from './shared';

// Column sorting. `sortBy` is "<key>:<dir>"; clicking a header toggles the
// direction, or switches keys using the direction that reads naturally.
const SORT_DEFAULT_DIR = {
  title: 'asc', author: 'asc', status: 'asc',
  published: 'desc', modified: 'desc', seo: 'desc', readability: 'desc', translations: 'desc'
};
const SORT_LABELS = {
  title: 'Title', author: 'Author', status: 'Status', published: 'Published',
  modified: 'Modified', seo: 'SEO score', readability: 'Readability', translations: 'Translations'
};
const SORT_PRESETS = [
  ['published:desc', 'Newest First'],
  ['published:asc', 'Oldest First'],
  ['modified:desc', 'Recently Modified'],
  ['title:asc', 'Title A → Z'],
  ['seo:asc', 'SEO Score: Low → High'],
  ['seo:desc', 'SEO Score: High → Low'],
  ['readability:asc', 'Readability: Low → High'],
  ['readability:desc', 'Readability: High → Low'],
  ['translations:asc', 'Fewest Translations']
];

function LangMatrix({ langs }) {
  const have = new Set(langs || []);
  const done = ALL_LANGUAGES.filter(l => have.has(l.code)).length;
  const missing = ALL_LANGUAGES.filter(l => !have.has(l.code)).map(l => l.label);
  const complete = done === ALL_LANGUAGES.length;
  return (
    <div
      className="lang-matrix"
      role="img"
      aria-label={`${done} of ${ALL_LANGUAGES.length} languages translated${missing.length ? `. Missing: ${missing.join(', ')}` : ''}`}
    >
      <div className="lang-matrix-grid">
        {LANGUAGE_ROWS.map((row, i) => (
          <div key={i} className="lang-matrix-row">
            {row.map(l => {
              const has = have.has(l.code);
              return (
                <span key={l.code} className={`lang-chip ${has ? 'done' : ''}`} title={`${l.label} — ${has ? 'translated' : 'not translated'}`}>
                  {l.short}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <span className={`lang-count ${complete ? 'complete' : ''}`} title={complete ? 'All languages translated' : `Missing: ${missing.join(', ')}`}>
        {done}/{ALL_LANGUAGES.length}
      </span>
    </div>
  );
}

// Modified-column formatting. The time is rendered only after mount (see
// `mounted` in the component) so a server in another timezone can't cause a
// hydration mismatch.
function formatDatePart(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatTimePart(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Score badges use the same thresholds as the editor's audit panel:
// SEO ≥80 good / ≥50 needs work; Flesch ≥65 plain English / ≥50 fairly standard.
function ScorePill({ value, kind, grade }) {
  if (typeof value !== 'number') {
    return <span className="score-pill none" title="Not scored yet">—</span>;
  }
  const good = kind === 'seo' ? 80 : 65;
  const tone = value >= good ? 'good' : value >= 50 ? 'mid' : 'poor';
  const label = kind === 'seo'
    ? (tone === 'good' ? 'Good' : tone === 'mid' ? 'Needs work' : 'Poor')
    : (tone === 'good' ? 'Plain English' : tone === 'mid' ? 'Fairly standard' : 'Difficult');
  const title = kind === 'seo'
    ? `SEO score ${value}/100 · ${label}`
    : `Flesch Reading Ease ${value}/100${typeof grade === 'number' ? ` · Grade ${grade}` : ''} · ${label}`;
  return (
    <span className={`score-pill ${tone}`} title={title}>
      <span className="score-pill-ring" style={{ '--pct': value }} aria-hidden="true" />
      <span>
        {value}
        <span className="score-sub">{kind === 'seo' ? label : (typeof grade === 'number' ? `Grade ${grade}` : label)}</span>
      </span>
    </span>
  );
}

export default function DashboardClient({ initialPosts, categories = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('published:desc');
  const [dateFilter, setDateFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const POSTS_PER_PAGE = 20;

  const [loadingId, setLoadingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkLoading, setBulkLoading] = useState('');
  const [bulkNotice, setBulkNotice] = useState('');
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
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

  // With a "Translated to X" filter active, the Post column shows X's title
  // and links open the editor on that language tab.
  const displayLang = languageFilter.startsWith('has:') ? languageFilter.slice(4) : null;
  const displayLangShort = displayLang ? (ALL_LANGUAGES.find(l => l.code === displayLang)?.short || displayLang.toUpperCase()) : '';
  const shownTitle = (post) => decodeEntities((displayLang && post.translationTitles?.[displayLang]) || post.title);
  const editorHref = (post) => `/admin/editor?id=${post._id}${displayLang ? `&lang=${encodeURIComponent(displayLang)}` : ''}`;

  // Filter posts based on search, status, and category
  let filteredPosts = posts.filter((post) => {
    const needle = searchTerm.toLowerCase();
    const matchesSearch =
      !needle ||
      post.title?.toLowerCase().includes(needle) ||
      shownTitle(post).toLowerCase().includes(needle) ||
      post.author?.toLowerCase().includes(needle) ||
      post.slug?.toLowerCase().includes(needle) ||
      post.seo?.primaryKeyword?.toLowerCase().includes(needle);
    const matchesStatus = statusFilter === 'all' || post.status === statusFilter;
    const matchesCategory =
      categoryFilter === 'all' ||
      (post.categories && post.categories.includes(categoryFilter));

    let matchesDate = true;
    if (dateFilter) {
      const postDate = new Date(post.publishedAt || post.createdAt).toISOString().split('T')[0];
      matchesDate = postDate.startsWith(dateFilter);
    }

    // Filter values are "has:<code>" or "missing:<code>". Global English is
    // the base post itself, never a translation, so it isn't listed.
    let matchesLanguage = true;
    if (languageFilter !== 'all') {
      const [mode, code] = languageFilter.split(':');
      const has = !!post.translationLangs?.includes(code);
      matchesLanguage = mode === 'missing' ? !has : has;
    }

    return matchesSearch && matchesStatus && matchesCategory && matchesDate && matchesLanguage;
  });

  const [sortKey, sortDir] = sortBy.split(':');
  const dirSign = sortDir === 'asc' ? 1 : -1;
  filteredPosts = [...filteredPosts].sort((a, b) => {
    // Unscored posts sort last whichever direction is chosen.
    const byNumber = (av, bv) => {
      const an = typeof av === 'number' ? av : null;
      const bn = typeof bv === 'number' ? bv : null;
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      return dirSign * (an - bn);
    };
    const byText = (av, bv) => dirSign * (av || '').localeCompare(bv || '', undefined, { sensitivity: 'base' });
    const byDate = (av, bv) => dirSign * (new Date(av || 0) - new Date(bv || 0));

    switch (sortKey) {
      case 'title': return byText(shownTitle(a), shownTitle(b));
      case 'author': return byText(a.author, b.author);
      case 'status': return byText(a.status, b.status);
      case 'modified': return byDate(a.updatedAt, b.updatedAt);
      case 'seo': return byNumber(a.seo?.score, b.seo?.score);
      case 'readability': return byNumber(a.seo?.readability, b.seo?.readability);
      case 'translations': return byNumber(a.translationLangs?.length || 0, b.translationLangs?.length || 0);
      default: return byDate(a.publishedAt || a.createdAt, b.publishedAt || b.createdAt);
    }
  });

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPosts = filteredPosts.slice(
    (safePage - 1) * POSTS_PER_PAGE,
    safePage * POSTS_PER_PAGE
  );

  // Any filter/sort change can shrink the result set or reorder it, so jump
  // back to page 1 instead of leaving the view stranded on a page that may
  // no longer make sense.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [searchTerm, statusFilter, categoryFilter, dateFilter, languageFilter, sortBy]);

  // ---- Multi-select + bulk actions ----------------------------------------
  const pageIds = paginatedPosts.map(p => p._id);
  const selectedOnPage = pageIds.filter(id => selectedIds.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  const flashBulkNotice = (message) => {
    setBulkNotice(message);
    setTimeout(() => setBulkNotice(''), 5000);
  };

  const handleBulk = async (action) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'delete' && !confirm(`Delete ${ids.length} post${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) {
      return;
    }

    setBulkLoading(action);
    try {
      const res = await fetch('/api/admin/posts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Bulk action failed.');
      }

      if (action === 'delete') {
        setPosts(prev => prev.filter(p => !selectedIds.has(p._id)));
      } else {
        const byId = new Map((data.posts || []).map(p => [p._id, p]));
        setPosts(prev => prev.map(p => (byId.has(p._id) ? { ...p, ...byId.get(p._id) } : p)));
      }
      setSelectedIds(new Set());
      const verb = action === 'delete' ? 'deleted' : action === 'publish' ? 'published' : 'moved to draft';
      flashBulkNotice(`${data.affected} post${data.affected === 1 ? '' : 's'} ${verb}.`);
    } catch (err) {
      console.error('Bulk action error:', err);
      alert(err.message || 'Bulk action failed.');
    } finally {
      setBulkLoading('');
    }
  };

  const toggleSort = (key) => {
    setSortBy(prev => {
      const [k, d] = prev.split(':');
      if (k === key) return `${key}:${d === 'asc' ? 'desc' : 'asc'}`;
      return `${key}:${SORT_DEFAULT_DIR[key] || 'asc'}`;
    });
  };

  const renderSortableTh = (key, label, className = '') => {
    const active = sortKey === key;
    return (
      <th
        className={`${className} sortable ${active ? 'active' : ''}`}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className="th-sort-btn" onClick={() => toggleSort(key)} title={`Sort by ${label.toLowerCase()}`}>
          {label}
          <span className="sort-icon" aria-hidden="true">{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
        </button>
      </th>
    );
  };

  // How many posts carry each translation, for the language filter labels.
  const languageCounts = useMemo(() => {
    const counts = {};
    for (const post of posts) {
      for (const code of post.translationLangs || []) counts[code] = (counts[code] || 0) + 1;
    }
    return counts;
  }, [posts]);

  // Header tiles for the posts tab: they describe the filtered set, so they
  // move with the search box and dropdowns. (filteredPosts is rebuilt every
  // render, so there's nothing to memoize against.)
  const filtersActive = !!searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || languageFilter !== 'all' || !!dateFilter;
  const scoredFiltered = filteredPosts.filter(p => typeof p.seo?.score === 'number');
  const postSummary = {
    total: filteredPosts.length,
    allTotal: posts.length,
    published: filteredPosts.filter(p => p.status === 'published').length,
    drafts: filteredPosts.filter(p => p.status === 'draft').length,
    avgSeo: scoredFiltered.length ? Math.round(scoredFiltered.reduce((sum, p) => sum + p.seo.score, 0) / scoredFiltered.length) : null,
    needsWork: scoredFiltered.filter(p => p.seo.score < 50).length
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const TAB_META = {
    analytics: { title: 'Analytics', subtitle: 'Google Analytics traffic, banner clicks, content health and what to work on next.' },
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
          <div className={`posts-summary ${filtersActive ? 'is-filtered' : ''}`}>
            <div className="posts-summary-tile">
              <span className="posts-summary-value">
                {postSummary.total}
                {filtersActive && <span className="posts-summary-of">of {postSummary.allTotal}</span>}
              </span>
              <span className="posts-summary-label">{filtersActive ? 'Matching posts' : 'Total posts'}</span>
            </div>
            <div className="posts-summary-tile">
              <span className="posts-summary-value" style={{ color: '#15803d' }}>{postSummary.published}</span>
              <span className="posts-summary-label">Published</span>
            </div>
            <div className="posts-summary-tile">
              <span className="posts-summary-value" style={{ color: '#d97706' }}>{postSummary.drafts}</span>
              <span className="posts-summary-label">Drafts</span>
            </div>
            <div className="posts-summary-tile">
              <span className="posts-summary-value">{postSummary.avgSeo === null ? '—' : postSummary.avgSeo}</span>
              <span className="posts-summary-label">Avg SEO score</span>
            </div>
            <div className="posts-summary-tile">
              <span className="posts-summary-value" style={{ color: postSummary.needsWork > 0 ? '#dc2626' : '#15803d' }}>{postSummary.needsWork}</span>
              <span className="posts-summary-label">SEO below 50</span>
            </div>
          </div>

          <div className="dashboard-filters">
            <input
              type="text"
              className="dashboard-search-input"
              placeholder="Search title, author, slug or keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((cat, i) => (
                <option key={i} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">All Languages</option>
              <optgroup label="Translated to">
                {ALL_LANGUAGES.map(l => (
                  <option key={`has:${l.code}`} value={`has:${l.code}`}>
                    {l.label} ({languageCounts[l.code] || 0})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Missing translation">
                {ALL_LANGUAGES.map(l => (
                  <option key={`missing:${l.code}`} value={`missing:${l.code}`}>
                    Missing {l.label} ({posts.length - (languageCounts[l.code] || 0)})
                  </option>
                ))}
              </optgroup>
            </select>

            <input
              type={dateFilter ? "month" : "text"}
              placeholder="Filter by Month"
              onFocus={(e) => (e.target.type = "month")}
              onBlur={(e) => { if (!dateFilter) e.target.type = "text"; }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_PRESETS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
              {!SORT_PRESETS.some(([value]) => value === sortBy) && (
                <option value={sortBy}>
                  {SORT_LABELS[sortKey] || sortKey}: {sortDir === 'asc' ? 'ascending' : 'descending'}
                </option>
              )}
            </select>
          </div>

          {selectedIds.size > 0 && (
            <div className="dashboard-bulk-bar" role="region" aria-label="Bulk actions">
              <strong>{selectedIds.size} selected</strong>
              <button type="button" className="bulk-btn" onClick={() => handleBulk('publish')} disabled={!!bulkLoading}>
                {bulkLoading === 'publish' ? 'Publishing…' : 'Publish'}
              </button>
              <button type="button" className="bulk-btn" onClick={() => handleBulk('draft')} disabled={!!bulkLoading}>
                {bulkLoading === 'draft' ? 'Updating…' : 'Move to Draft'}
              </button>
              <button type="button" className="bulk-btn danger" onClick={() => handleBulk('delete')} disabled={!!bulkLoading}>
                {bulkLoading === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className="bulk-clear" onClick={() => setSelectedIds(new Set())} disabled={!!bulkLoading}>
                Clear selection
              </button>
            </div>
          )}
          {bulkNotice && (
            <div className="dashboard-inline-notice" role="status">{bulkNotice}</div>
          )}

          <div className="dashboard-table-container">
            {filteredPosts.length > 0 ? (
              <table className="dashboard-table posts-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        className="dashboard-check"
                        checked={allOnPageSelected}
                        ref={(el) => { if (el) el.indeterminate = someOnPageSelected; }}
                        onChange={toggleSelectPage}
                        aria-label="Select all posts on this page"
                      />
                    </th>
                    {renderSortableTh('title', 'Post', 'col-post')}
                    {renderSortableTh('author', 'Author', 'col-author')}
                    {renderSortableTh('published', 'Published', 'col-date')}
                    {renderSortableTh('modified', 'Modified', 'col-modified')}
                    {renderSortableTh('status', 'Status', 'col-status')}
                    {renderSortableTh('seo', 'SEO', 'col-seo')}
                    {renderSortableTh('readability', 'Readability', 'col-read')}
                    {renderSortableTh('translations', 'Translations', 'col-langs')}
                    <th className="col-actions align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPosts.map((post) => {
                    const isSelected = selectedIds.has(post._id);
                    return (
                      <tr key={post._id} className={isSelected ? 'is-selected' : ''}>
                        <td className="col-check">
                          <input
                            type="checkbox"
                            className="dashboard-check"
                            checked={isSelected}
                            onChange={() => toggleSelect(post._id)}
                            aria-label={`Select "${decodeEntities(post.title)}"`}
                          />
                        </td>
                        <td className="col-post">
                          <div className="post-cell">
                            <PostThumb src={post.featuredImage} alt={post.featuredImageAlt} />
                            <div className="post-body">
                              <a href={editorHref(post)} className="post-title-link" title={displayLang ? `English: ${decodeEntities(post.title)}` : undefined}>
                                {shownTitle(post)}
                                {displayLang && post.translationTitles?.[displayLang] && (
                                  <span className="post-lang-tag" title={`Showing the ${displayLangShort} translation`}>{displayLangShort}</span>
                                )}
                              </a>
                              <div className="post-meta">
                                {(post.categories || []).slice(0, 2).map(cat => (
                                  <span key={cat} className="badge-cat">{cat}</span>
                                ))}
                                {post.seo?.primaryKeyword && (
                                  <span className="post-keyword" title="Target keyword">🎯 {post.seo.primaryKeyword}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="col-author" data-label="Author">{post.author || 'Admin'}</td>
                        <td className="col-date" data-label="Published">{formatDate(post.publishedAt || post.createdAt)}</td>
                        <td className="col-modified" data-label="Modified">
                          {post.updatedAt ? (
                            <>
                              <span>{formatDatePart(post.updatedAt)}</span>
                              <span className="cell-sub">{mounted ? formatTimePart(post.updatedAt) : '\u00a0'}</span>
                            </>
                          ) : (
                            <span className="cell-muted">—</span>
                          )}
                        </td>
                        <td className="col-status" data-label="Status">
                          <span className={`badge-status ${post.status}`}>
                            {post.status}
                          </span>
                        </td>
                        <td className="col-seo" data-label="SEO"><ScorePill value={post.seo?.score} kind="seo" /></td>
                        <td className="col-read" data-label="Readability"><ScorePill value={post.seo?.readability} kind="readability" grade={post.seo?.grade} /></td>
                        <td className="col-langs" data-label="Translations">
                          <LangMatrix langs={post.translationLangs} />
                        </td>
                        <td className="col-actions">
                          <div className="row-actions">
                            <a href={editorHref(post)} className="row-action edit">Edit</a>
                            <a href={`/test-blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="row-action view" title="Open preview in a new tab" aria-label="Open preview in a new tab">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDelete(post._id, post.title)}
                              className="row-action delete"
                              disabled={loadingId === post._id}
                            >
                              {loadingId === post._id ? 'Deleting…' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="dashboard-table-empty">
                <p>No blog posts match these filters.</p>
              </div>
            )}
          </div>

          {filteredPosts.length > 0 && (
            <div className="dashboard-pagination">
              <span className="dashboard-pagination-info">
                Showing {(safePage - 1) * POSTS_PER_PAGE + 1}
                –{Math.min(safePage * POSTS_PER_PAGE, filteredPosts.length)} of {filteredPosts.length}
              </span>
              <div className="dashboard-pagination-controls">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="dashboard-pagination-btn"
                >
                  Previous
                </button>
                <span className="dashboard-pagination-page">Page {safePage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="dashboard-pagination-btn"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'analytics' && (
        <AnalyticsTab posts={posts} categories={categories} bannerSettings={bannerSettings} />
      )}

      {activeTab === 'banners' && (
        <div style={{ padding: '1rem 0' }}>
          <div className="banner-tabs">
            <button
              onClick={() => loadBannerToEdit('global')}
              className={`banner-tab${activeBannerTab === 'global' ? ' active' : ''}`}
            >
              Global Banner
            </button>
            {bannerSettings.filter(b => b.type === 'category').map((banner) => (
              <button
                key={banner._id}
                onClick={() => loadBannerToEdit(banner._id)}
                className={`banner-tab${activeBannerTab === banner._id ? ' active' : ''}`}
              >
                {banner.name || 'Unnamed Campaign'}
              </button>
            ))}
            <button
              onClick={() => loadBannerToEdit('new')}
              className={`banner-tab banner-tab-new${activeBannerTab === 'new' ? ' active' : ''}`}
            >
              + Create Campaign
            </button>
          </div>

          <div className="banner-form-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                {editingBanner.type === 'global' ? 'Global Banner Settings' : (editingBanner._id ? 'Edit Campaign' : 'New Campaign')}
              </h3>
              {editingBanner.type === 'category' && editingBanner._id && (
                <button onClick={handleBannerDelete} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>Delete Campaign</button>
              )}
            </div>

            <div className="banner-form-grid">
              {editingBanner.type === 'category' && (
                <>
                  <div className="banner-field">
                    <label>Campaign Name</label>
                    <input
                      type="text"
                      value={editingBanner.name || ''}
                      onChange={e => setEditingBanner({ ...editingBanner, name: e.target.value })}
                      placeholder="e.g. Summer Sale 2026"
                    />
                  </div>

                  <div className="banner-field">
                    <label>Target Categories</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#f9fafb', padding: '1rem', borderRadius: '9px', border: '1px solid #e5e7eb', maxHeight: '200px', overflowY: 'auto' }}>
                      {categories.map((cat, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input
                            type="checkbox"
                            id={`cat-${i}`}
                            checked={(editingBanner.categories || []).includes(cat)}
                            onChange={() => handleCategoryCheckbox(cat)}
                          />
                          <label htmlFor={`cat-${i}`} style={{ fontSize: '0.9rem', color: '#4b5563', fontWeight: 400, marginBottom: 0, display: 'inline' }}>{cat}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <div className="banner-field">
                <label>Image URL</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={editingBanner.promotion?.imageUrl || ''}
                    onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, imageUrl: e.target.value } })}
                    style={{ flexGrow: 1 }}
                    placeholder="https://..."
                  />
                  <button
                    onClick={handleBannerImageUpload}
                    style={{ padding: '0.75rem 1.25rem', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#4b5563', borderRadius: '9px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                    onMouseOver={(e) => e.target.style.backgroundColor = '#e5e7eb'}
                    onMouseOut={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  >
                    Upload
                  </button>
                </div>
              </div>

              <div className="banner-field">
                <label>Promotion Text</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.text || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, text: e.target.value } })}
                  placeholder="Get 20% off..."
                />
              </div>

              <div className="banner-field">
                <label>Destination Link</label>
                <input
                  type="text"
                  value={editingBanner.promotion?.link || ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, link: e.target.value } })}
                  placeholder="https://..."
                />
              </div>

              <div className="banner-field">
                <label>Placement</label>
                <select
                  value={editingBanner.promotion?.placement || 'sidebar'}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, placement: e.target.value } })}
                >
                  <option value="sidebar">Sidebar</option>
                  <option value="post_top">Inside Post (Top)</option>
                  <option value="post_bottom">Inside Post (Bottom)</option>
                </select>
              </div>

              <div className="banner-field">
                <label>End Date</label>
                <input
                  type="date"
                  value={editingBanner.promotion?.endDate ? new Date(editingBanner.promotion.endDate).toISOString().split('T')[0] : ''}
                  onChange={e => setEditingBanner({ ...editingBanner, promotion: { ...editingBanner.promotion, endDate: e.target.value } })}
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
                <label htmlFor="isActive" style={{ fontWeight: 600, color: '#4b5563', marginBottom: 0 }}>Enable this banner</label>
              </div>

              <button
                onClick={handleSaveBanner}
                style={{ marginTop: '1rem', padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #74b75c, #5e9e48)', color: 'white', border: 'none', borderRadius: '9px', fontWeight: 600, cursor: 'pointer', fontSize: '1rem', width: 'fit-content', boxShadow: '0 4px 10px rgba(116, 183, 92, 0.25)' }}
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

'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardClient({ initialPosts, categories = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');
  const [loadingId, setLoadingId] = useState(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const router = useRouter();

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
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem 0' }}>
      {/* Dashboard Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2.5rem',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, color: '#1f2937' }}>
            CMS Dashboard
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Manage your blog posts, draft articles, and track SEO metrics.
          </p>
        </div>
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
          <button
            onClick={handleLogout}
            disabled={logoutLoading}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: 'transparent',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            {logoutLoading ? 'Logging out...' : 'Log Out'}
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
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

        <div style={{
          display: 'flex',
          alignItems: 'center',
          color: '#6b7280',
          fontSize: '0.9rem',
          marginLeft: 'auto'
        }}>
          Showing {filteredPosts.length} of {posts.length} posts
        </div>
      </div>

      {/* Posts Table List */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
      }}>
        {filteredPosts.length > 0 ? (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
          }}>
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
    </div>
  );
}

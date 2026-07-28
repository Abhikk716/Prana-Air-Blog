'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Editor } from '@tinymce/tinymce-react';
import './editor.css';

function BlogEditorContent() {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugLocked, setIsSlugLocked] = useState(true);
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [status, setStatus] = useState('draft');
  const [author, setAuthor] = useState('Admin');

  // Tag and Category state
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');

  // SEO State
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // Promotion State
  const [promoImage, setPromoImage] = useState('');
  const [promoText, setPromoText] = useState('');
  const [promoLink, setPromoLink] = useState('');
  const [promoEndDate, setPromoEndDate] = useState('');
  const [promoActive, setPromoActive] = useState(false);

  // Multilingual states
  const [selectedLang, setSelectedLang] = useState('en');
  const selectedLangRef = useRef('en');

  useEffect(() => {
    selectedLangRef.current = selectedLang;
  }, [selectedLang]);

  const [editorData, setEditorData] = useState({
    en: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    hi: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    es: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    de: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    fr: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    ru: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    ja: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' }
  });

  const onTitleChange = (val) => {
    setTitle(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], title: val }
    }));
  };

  const onContentChange = (val) => {
    setContent(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], content: val }
    }));
  };

  const onExcerptChange = (val) => {
    setExcerpt(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], excerpt: val }
    }));
  };

  const onSeoTitleChange = (val) => {
    setSeoTitle(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], seoTitle: val }
    }));
  };

  const onSeoDescriptionChange = (val) => {
    setSeoDescription(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], seoDescription: val }
    }));
  };

  const handleLangChange = (newLang) => {
    // 1. Sync current state back to editorData to ensure it is up to date
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: {
        title,
        content,
        excerpt,
        seoTitle,
        seoDescription
      }
    }));

    // 2. Load values for new language
    const data = editorData[newLang] || { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' };
    setTitle(data.title);
    setContent(data.content);
    setExcerpt(data.excerpt);
    setSeoTitle(data.seoTitle);
    setSeoDescription(data.seoDescription);

    // Update TinyMCE
    setContent(data.content);

    setSelectedLang(newLang);
  };

  // UI States
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [authChecked, setAuthChecked] = useState(false);
  const [quillLoaded, setQuillLoaded] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get('id'); // Get the post ID if we are editing

  const editorRef = useRef(null);

  // 1. Authenticate check on Client Component
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/admin/check-auth');
        if (!res.ok) {
          router.push('/admin/login');
        } else {
          setAuthChecked(true);
        }
      } catch (err) {
        console.error(err);
        router.push('/admin/login');
      }
    };
    checkAuth();
  }, [router]);

  // 2. Fetch existing post data if in Edit Mode
  useEffect(() => {
    if (!postId || !authChecked) return;

    const fetchPost = async () => {
      try {
        const res = await fetch(`/api/posts/${postId}`);
        const data = await res.json();

        if (res.ok && data.success) {
          const post = data.data;

          const loadedData = {
            en: {
              title: post.title || '',
              content: post.content || '',
              excerpt: post.excerpt || '',
              seoTitle: post.seo?.title || '',
              seoDescription: post.seo?.description || ''
            },
            hi: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            es: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            de: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            fr: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            ru: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            ja: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' }
          };

          if (post.translations) {
            const postTranslations = post.translations;
            for (const lang of ['hi', 'es', 'de', 'fr', 'ru', 'ja']) {
              if (postTranslations[lang]) {
                const t = postTranslations[lang];
                loadedData[lang] = {
                  title: t.title || '',
                  content: t.content || '',
                  excerpt: t.excerpt || '',
                  seoTitle: t.seo?.title || '',
                  seoDescription: t.seo?.description || ''
                };
              }
            }
          }

          setEditorData(loadedData);

          // Populate active inputs with English
          setTitle(loadedData.en.title);
          setContent(loadedData.en.content);
          setExcerpt(loadedData.en.excerpt);
          setSeoTitle(loadedData.en.seoTitle);
          setSeoDescription(loadedData.en.seoDescription);

          setSlug(post.slug || '');
          setFeaturedImage(post.featuredImage || '');
          setStatus(post.status || 'draft');
          setAuthor(post.author || 'Admin');
          setCategories(post.categories || []);
          setTags(post.tags || []);
          
          if (post.promotion) {
            setPromoImage(post.promotion.imageUrl || '');
            setPromoText(post.promotion.text || '');
            setPromoLink(post.promotion.link || '');
            setPromoActive(post.promotion.isActive || false);
            if (post.promotion.endDate) {
              setPromoEndDate(new Date(post.promotion.endDate).toISOString().split('T')[0]);
            }
          }
          setIsSlugLocked(true);
        } else {
          showNotification(data.error || 'Failed to load post.', 'error');
        }
      } catch (err) {
        console.error(err);
        showNotification('Failed to fetch post details.', 'error');
      }
    };

    fetchPost();
  }, [postId, authChecked]);



  // Auto-slugify when title changes (if slug is unlocked or not editing)
  useEffect(() => {
    if (isSlugLocked && title && !postId) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
      setSlug(generatedSlug);
    }
  }, [title, isSlugLocked, postId]);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, 4000);
  };

  const handleEditorChange = (newContent, editor) => {
    setContent(newContent);
    setEditorData(prev => ({
      ...prev,
      [selectedLangRef.current]: {
        ...prev[selectedLangRef.current],
        content: newContent
      }
    }));
  };

  const handleFeaturedImageUpload = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        showNotification('Uploading featured image...', 'success');

        try {
          const res = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();

          if (res.ok && data.success) {
            setFeaturedImage(data.url);
            showNotification('Featured image uploaded successfully!');
          } else {
            showNotification(data.error || 'Upload failed.', 'error');
          }
        } catch (err) {
          console.error(err);
          showNotification('Network error during upload.', 'error');
        }
      }
    };
  };

  const handlePromoImageUpload = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        showNotification('Uploading promo image...', 'success');

        try {
          const res = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();

          if (res.ok && data.success) {
            setPromoImage(data.url);
            showNotification('Promo image uploaded successfully!');
          } else {
            showNotification(data.error || 'Upload failed.', 'error');
          }
        } catch (err) {
          console.error(err);
          showNotification('Network error during upload.', 'error');
        }
      }
    };
  };

  const handleAddCategory = (e) => {
    e.preventDefault();
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (catToRemove) => {
    setCategories(categories.filter((cat) => cat !== catToRemove));
  };

  const handleAddTag = (e) => {
    e.preventDefault();
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // 5. Handle Save (Draft or Published)
  const handleSave = async (publishStatus) => {
    const postStatus = publishStatus || status;

    // Sync active inputs of current language to editorData
    const updatedEditorData = {
      ...editorData,
      [selectedLang]: {
        title,
        content,
        excerpt,
        seoTitle,
        seoDescription
      }
    };

    const enData = updatedEditorData.en;

    if (!enData.title.trim()) {
      showNotification('Please enter a title for English.', 'error');
      return;
    }
    if (!slug.trim()) {
      showNotification('Please enter a slug.', 'error');
      return;
    }

    // Build translations payload
    const payloadTranslations = {};
    for (const lang of ['hi', 'es', 'de', 'fr', 'ru', 'ja']) {
      const t = updatedEditorData[lang];
      if (t.title.trim() || t.content.trim()) {
        payloadTranslations[lang] = {
          title: t.title,
          content: t.content,
          excerpt: t.excerpt || t.title,
          seo: {
            title: t.seoTitle || t.title,
            description: t.seoDescription || t.excerpt || t.title,
            keywords: [...categories, ...tags]
          }
        };
      }
    }

    const postData = {
      title: enData.title,
      slug,
      content: enData.content,
      excerpt: enData.excerpt || enData.title,
      featuredImage,
      status: postStatus,
      author,
      categories,
      tags,
      seo: {
        title: enData.seoTitle || enData.title,
        description: enData.seoDescription || enData.excerpt || enData.title,
        keywords: [...categories, ...tags],
      },
      promotion: {
        imageUrl: promoImage,
        text: promoText,
        link: promoLink,
        endDate: promoEndDate ? new Date(promoEndDate) : null,
        isActive: promoActive
      },
      translations: payloadTranslations
    };

    try {
      const url = postId ? `/api/posts/${postId}` : '/api/posts';
      const method = postId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setStatus(postStatus);
        showNotification(`Post successfully saved as ${postStatus}!`);

        if (postStatus === 'published') {
          // Wait and redirect to dashboard
          setTimeout(() => {
            router.push('/admin/dashboard');
            router.refresh();
          }, 1000);
        } else {
          // If saved as draft and it's a new post, update URL so we get the ID for further saves and Preview button
          if (!postId && result.data && result.data._id) {
            router.push(`/admin/editor?id=${result.data._id}`);
          }
        }
      } else {
        showNotification(result.error || 'Failed to save post.', 'error');
      }
    } catch (err) {
      console.error(err);
      showNotification('Network error occurred while saving.', 'error');
    }
  };

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#94a3b8' }}>
        <h2>Verifying session...</h2>
      </div>
    );
  }

  return (
    <div className="editor-container">


      {notification.show && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '1rem 1.5rem',
          borderRadius: '8px',
          backgroundColor: notification.type === 'error' ? '#ef4444' : '#10b981',
          color: 'white',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
          fontWeight: 600,
          transition: 'all 0.3s ease'
        }}>
          {notification.message}
        </div>
      )}

      {/* Editor Header Navigation */}
      <div className="editor-header">
        <div className="header-title">
          <a href="/admin/dashboard" style={{ display: 'inline-block', color: '#10b981', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
            &larr; Back to Dashboard
          </a>
          <h1>{postId ? 'Edit Blog Post' : 'Write a New Post'}</h1>
          <p>{postId ? 'Update post content and SEO configs in MongoDB' : 'Draft and publish blog content directly to your MongoDB database'}</p>
        </div>
        <div className="action-buttons">
          {postId && slug && (
            <a
              href={`/test-blog/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ backgroundColor: '#f1f5f9', color: '#334155', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
            >
              Preview
            </a>
          )}
          <button className="btn btn-secondary" onClick={() => handleSave('draft')}>
            Save Draft
          </button>
          <button className="btn btn-primary" onClick={() => handleSave('published')}>
            Publish Post
          </button>
        </div>
      </div>

      <div className="editor-layout">
        {/* Main Work Area */}
        <div className="main-editor-pane">
          {/* Translation Tab Bar */}
          <div className="language-selector-tabs" style={{
            display: 'flex',
            gap: '0.35rem',
            marginBottom: '1.75rem',
            borderBottom: '2px solid #fbfbfbff',
            paddingBottom: '0.75rem',
            flexWrap: 'wrap'
          }}>
            {[
              { code: 'en', label: 'English (EN)' },
              { code: 'hi', label: 'Hindi (HI)' },
              { code: 'es', label: 'Spanish (ES)' },
              { code: 'de', label: 'German (DE)' },
              { code: 'fr', label: 'French (FR)' },
              { code: 'ru', label: 'Russian (RU)' },
              { code: 'ja', label: 'Japanese (JA)' }
            ].map(lang => {
              const isActive = selectedLang === lang.code;
              const hasContent = lang.code === 'en'
                ? title.trim() !== ''
                : (editorData[lang.code]?.title?.trim() || '') !== '';
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLangChange(lang.code)}
                  style={{
                    padding: '0.5rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: isActive ? '#dcfce7' : 'transparent',
                    color: isActive ? '#15803d' : '#64748b',
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = '#f1f5f9';
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {lang.label}
                  {hasContent && (
                    <span style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: '#22c55e',
                      display: 'inline-block'
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="form-group">
            <label className="form-label">Post Title ({selectedLang.toUpperCase()})</label>
            <input
              type="text"
              className="input-text"
              placeholder={`Enter ${selectedLang === 'en' ? 'English' : 'translated'} title here...`}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>URL Slug</span>
              <button
                type="button"
                onClick={() => setIsSlugLocked(!isSlugLocked)}
                style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', fontSize: '0.8125rem' }}
              >
                {isSlugLocked ? 'Edit Slug' : 'Lock Slug'}
              </button>
            </label>
            <input
              type="text"
              className="input-text"
              value={slug}
              disabled={isSlugLocked}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="url-friendly-slug-will-appear-here"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Excerpt / Summary ({selectedLang.toUpperCase()})</label>
            <input
              type="text"
              className="input-text"
              placeholder={`Brief overview of the article in ${selectedLang.toUpperCase()}...`}
              value={excerpt}
              onChange={(e) => onExcerptChange(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Content Editor</label>
            <div className="rich-editor-wrapper">
              <Editor
                tinymceScriptSrc="https://cdnjs.cloudflare.com/ajax/libs/tinymce/7.3.0/tinymce.min.js"
                onInit={(evt, editor) => editorRef.current = editor}
                value={content}
                onEditorChange={handleEditorChange}
                init={{
                  height: 600,
                  branding: false,
                  promotion: false,
                  menubar: true,
                  plugins: [
                    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
                    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
                    'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount', 'codesample'
                  ],
                  toolbar: 'undo redo | blocks | ' +
                    'bold italic forecolor | alignleft aligncenter ' +
                    'alignright alignjustify | bullist numlist outdent indent | ' +
                    'image media table | removeformat | code | help',
                  content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:14px; line-height: 1.6; }',
                  images_upload_handler: async (blobInfo, progress) => {
                    return new Promise(async (resolve, reject) => {
                      const formData = new FormData();
                      formData.append('file', blobInfo.blob(), blobInfo.filename());
                      try {
                        const res = await fetch('/api/admin/upload', {
                          method: 'POST',
                          body: formData,
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                          resolve(data.url);
                        } else {
                          reject(data.error || 'Upload failed.');
                        }
                      } catch (err) {
                        reject('Network error during image upload.');
                      }
                    });
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* Sidebar settings */}
        <div className="editor-sidebar">
          <div className="sidebar-card">
            <h3 className="sidebar-card-title">Publishing State</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span className="form-label">Status:</span>
              <span className={`status-badge ${status}`}>
                {status}
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">Author Name</label>
              <input
                type="text"
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>

          <div className="sidebar-card">
            <h3 className="sidebar-card-title">Media & Featured Image</h3>
            <div className="form-group">
              <label className="form-label">Featured Image</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {featuredImage && (
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
                    <img src={featuredImage} alt="Featured Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      type="button"
                      onClick={() => setFeaturedImage('')}
                      style={{ position: 'absolute', top: '5px', right: '5px', backgroundColor: 'rgba(239, 68, 68, 0.85)', border: 'none', color: 'white', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                    placeholder="Image URL or upload..."
                    value={featuredImage}
                    onChange={(e) => setFeaturedImage(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleFeaturedImageUpload}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                  >
                    Upload
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="sidebar-card">
            <h3 className="sidebar-card-title">Categories & Tags</h3>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">Categories</label>
              <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-text"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                  placeholder="e.g. Health"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem' }}>+</button>
              </form>
              <div className="tags-container">
                {categories.map((cat, i) => (
                  <span key={i} className="tag-badge">
                    {cat}
                    <button type="button" onClick={() => handleRemoveCategory(cat)}>×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Tags</label>
              <form onSubmit={handleAddTag} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-text"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                  placeholder="e.g. pm2.5"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem' }}>+</button>
              </form>
              <div className="tags-container">
                {tags.map((tag, i) => (
                  <span key={i} className="tag-badge">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="sidebar-card">
            <h3 className="sidebar-card-title">Product Promotion Banner</h3>
            
            <div className="form-group">
              <label className="form-label">Banner Image URL</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="text" className="input-text" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }} placeholder="Image URL or upload..." value={promoImage} onChange={(e) => setPromoImage(e.target.value)} />
                <button
                  type="button"
                  onClick={handlePromoImageUpload}
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}
                >
                  Upload
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Promotion Text</label>
              <input type="text" className="input-text" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }} placeholder="Get 20% off..." value={promoText} onChange={(e) => setPromoText(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Destination Link</label>
              <input type="url" className="input-text" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }} placeholder="https://..." value={promoLink} onChange={(e) => setPromoLink(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" className="input-text" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }} value={promoEndDate} onChange={(e) => setPromoEndDate(e.target.value)} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
              <input type="checkbox" id="promoActive" checked={promoActive} onChange={(e) => setPromoActive(e.target.checked)} style={{ width: '16px', height: '16px' }} />
              <label htmlFor="promoActive" style={{ fontWeight: 600, fontSize: '0.875rem' }}>Enable Banner for this post</label>
            </div>
          </div>

          <div className="sidebar-card">
            <h3 className="sidebar-card-title">SEO Engine ({selectedLang.toUpperCase()})</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label">SEO Meta Title ({selectedLang.toUpperCase()})</label>
              <input
                type="text"
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                placeholder={title || 'Custom SEO title...'}
                value={seoTitle}
                onChange={(e) => onSeoTitleChange(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">SEO Meta Description ({selectedLang.toUpperCase()})</label>
              <textarea
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', minHeight: '80px', fontFamily: 'inherit', resize: 'none' }}
                placeholder={excerpt || 'Custom SEO description...'}
                value={seoDescription}
                onChange={(e) => onSeoDescriptionChange(e.target.value)}
              ></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BlogEditor() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#94a3b8' }}>
        <h2>Loading editor...</h2>
      </div>
    }>
      <BlogEditorContent />
    </Suspense>
  );
}

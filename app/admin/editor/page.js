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
  const [existingCategories, setExistingCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');

  // SEO State
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  // Promotion State
  const [promoImage, setPromoImage] = useState('');
  const [promoText, setPromoText] = useState('');
  const [promoLink, setPromoLink] = useState('');
  const [promoPlacement, setPromoPlacement] = useState('sidebar');
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
          // Fetch existing categories for the dropdown
          fetch('/api/posts/meta')
            .then(r => r.json())
            .then(data => {
              if (data.success && data.data && data.data.categories) {
                setExistingCategories(data.data.categories.map(c => c.name));
              }
            })
            .catch(console.error);
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
            setPromoPlacement(post.promotion.placement || 'sidebar');
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
        placement: promoPlacement,
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
                    'image media table | removeformat | code | help customdesigns templates',
                  setup: (editor) => {
                    editor.ui.registry.addMenuButton('customdesigns', {
                      text: 'Custom Designs',
                      tooltip: 'Insert predefined designs',
                      fetch: (callback) => {
                        const items = [
                          {
                            type: 'menuitem',
                            text: 'Media Slider',
                            onAction: () => {
                              editor.insertContent(`
                                <div class="prana-gallery-box" style="border: 2px dashed #74b75c; padding: 20px; background: #f9f9f9; border-radius: 8px; margin: 2rem 0; min-height: 100px;">
                                  <p style="text-align: center; color: #74b75c; font-weight: bold; margin-bottom: 1rem;">--- Add your slider images below this line ---</p>
                                  <p><br></p>
                                </div><p><br></p>
                              `);
                            }
                          },
                          {
                            type: 'menuitem',
                            text: 'Stats Block',
                            onAction: () => {
                              editor.insertContent('<div class="custom-stats-block" style="background-color: #FAF6ED; border-radius: 20px; padding: 3rem 2rem; display: flex; justify-content: space-around; text-align: center; margin: 3rem 0; flex-wrap: wrap; gap: 2rem;"><div style="flex: 1; min-width: 150px;"><div style="font-size: 3rem; font-weight: 500; color: #173828; font-family: \'Playfair Display\', Georgia, serif; margin-bottom: 0.5rem;">64%</div><div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #C28E3A; letter-spacing: 1.5px;">LOWER PM2.5</div></div><div style="flex: 1; min-width: 150px;"><div style="font-size: 3rem; font-weight: 500; color: #173828; font-family: \'Playfair Display\', Georgia, serif; margin-bottom: 0.5rem;">3.2x</div><div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #C28E3A; letter-spacing: 1.5px;">BETTER SLEEP SCORE</div></div><div style="flex: 1; min-width: 150px;"><div style="font-size: 3rem; font-weight: 500; color: #173828; font-family: \'Playfair Display\', Georgia, serif; margin-bottom: 0.5rem;">92%</div><div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #C28E3A; letter-spacing: 1.5px;">REPORTED FEWER HEADACHES</div></div></div><p><br></p>');
                            }
                          },
                          {
                            type: 'menuitem',
                            text: 'FAQ Block',
                            onAction: () => {
                              editor.insertContent(`
                                <div class="prana-faq-block">
                                  <details class="prana-faq-item">
                                    <summary>Do I need an air purifier in every room?</summary>
                                    <div class="prana-faq-content">
                                      <p>Start with the bedroom. It's where you spend a third of your life, and where measurable health gains compound the fastest.</p>
                                    </div>
                                  </details>
                                  <details class="prana-faq-item">
                                    <summary>What AQI is safe indoors?</summary>
                                    <div class="prana-faq-content">
                                      <p>Write your answer here.</p>
                                    </div>
                                  </details>
                                  <details class="prana-faq-item">
                                    <summary>Do houseplants really clean air?</summary>
                                    <div class="prana-faq-content">
                                      <p>Write your answer here.</p>
                                    </div>
                                  </details>
                                </div><p><br></p>
                              `);
                            }
                          },
                          {
                            type: 'menuitem',
                            text: 'Expert Insight',
                            onAction: () => {
                              editor.insertContent('<div class="custom-expert-insight" style="background-color: #F1F6EC; border-radius: 20px; padding: 3rem; margin: 3rem 0;"><div style="margin-bottom: 1.5rem;"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 2L11.5 8.5L18 10L11.5 11.5L10 18L8.5 11.5L2 10L8.5 8.5L10 2Z" fill="#2E5A44"/></svg></div><h3 style="font-family: \'Playfair Display\', Georgia, serif; font-size: 1.75rem; font-weight: 700; color: #111827; margin-top: 0; margin-bottom: 1.5rem;">Expert insight</h3><p style="font-size: 1.15rem; color: #4B5563; font-style: normal; margin-bottom: 2rem; line-height: 1.7;">"A purifier that runs at 35% all day will out-perform one that runs at 100% for an hour. Indoor air is a long-form problem."</p><div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #6B7280; letter-spacing: 1.5px;">DR. MIRA LINDQVIST — INDOOR ENVIRONMENTS LAB, STOCKHOLM</div></div><p><br></p>');
                            }
                          }
                        ];
                        callback(items);
                      }
                    });
                    
                    editor.ui.registry.addMenuButton('templates', {
                      text: 'Templates',
                      tooltip: 'Insert pre-designed post templates',
                      fetch: (callback) => {
                        const items = [
                          {
                            type: 'menuitem',
                            text: 'Data / Research Report',
                            onAction: () => {
                              editor.insertContent(`
                                <h1 style="text-align: center;">City Air Quality Report: [Month Year]</h1>
                                <p style="text-align: center; font-size: 1.2rem; color: #666;">A comprehensive look at the recent trends in PM2.5 and AQI levels.</p>
                                <p><br></p>
                                <h2>Key Findings</h2>
                                <div class="custom-stats-block" style="background-color: #FAF6ED; border-radius: 20px; padding: 2rem; display: flex; justify-content: space-around; text-align: center; margin: 2rem 0; flex-wrap: wrap; gap: 1rem;">
                                  <div style="flex: 1; min-width: 150px;">
                                    <div style="font-size: 2.5rem; font-weight: 500; color: #173828; margin-bottom: 0.5rem;">15%</div>
                                    <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #C28E3A;">Increase in AQI</div>
                                  </div>
                                  <div style="flex: 1; min-width: 150px;">
                                    <div style="font-size: 2.5rem; font-weight: 500; color: #173828; margin-bottom: 0.5rem;">45 µg/m³</div>
                                    <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #C28E3A;">Avg PM2.5</div>
                                  </div>
                                </div>
                                <h2>Detailed Analysis</h2>
                                <p>Write your detailed analysis here, explaining the reasons behind the data changes...</p>
                                <div style="border: 2px dashed #ccc; padding: 40px; text-align: center; background: #f9f9f9; margin: 2rem 0; border-radius: 8px;">[ Insert Data Graph / Chart Image Here ]</div>
                                <div class="custom-expert-insight" style="background-color: #F1F6EC; border-radius: 20px; padding: 2rem; margin: 2rem 0;">
                                  <h3 style="margin-top: 0;">Expert insight</h3>
                                  <p>"Replace this text with a quote from an expert regarding this month's data."</p>
                                  <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 700; color: #6B7280;">EXPERT NAME — TITLE</div>
                                </div>
                                <h2>Conclusion</h2>
                                <p>Summarize the report and provide actionable advice here.</p><p><br></p>
                              `);
                            }
                          },
                          {
                            type: 'menuitem',
                            text: 'Educational Guide',
                            onAction: () => {
                              editor.insertContent(`
                                <h1>The Complete Guide to [Topic: e.g., Indoor Air Pollutants]</h1>
                                <p style="font-size: 1.2rem; color: #555;">Everything you need to know about [Topic] and how to protect yourself.</p>
                                <hr style="border-top: 1px solid #eaeaea; margin: 2rem 0;" />
                                <h2>What is [Topic]?</h2>
                                <p>Start with a simple, clear definition here...</p>
                                <h2>Why should you care?</h2>
                                <p>Explain the health impacts and why this matters to the reader...</p>
                                <div class="prana-gallery-box" style="border: 2px dashed #74b75c; padding: 20px; background: #f9f9f9; border-radius: 8px; margin: 2rem 0; text-align: center;">
                                  <p style="color: #74b75c; font-weight: bold;">[ Insert Educational Image / Infographic Here ]</p>
                                </div>
                                <h2>Frequently Asked Questions</h2>
                                <div class="prana-faq-block">
                                  <details class="prana-faq-item"><summary>Question 1?</summary><div class="prana-faq-content"><p>Answer 1...</p></div></details>
                                  <details class="prana-faq-item"><summary>Question 2?</summary><div class="prana-faq-content"><p>Answer 2...</p></div></details>
                                </div>
                                <p><br></p>
                              `);
                            }
                          },
                          {
                            type: 'menuitem',
                            text: 'Case Study / Success Story',
                            onAction: () => {
                              editor.insertContent(`
                                <h1>How [Client Name] Transformed Their Air Quality</h1>
                                <p style="font-size: 1.2rem; font-style: italic;">A success story about overcoming severe indoor pollution.</p>
                                <p><br></p>
                                <h2>The Challenge</h2>
                                <p>[Client Name] was facing significant issues with [mention problems like high PM2.5, allergies, etc.] before they reached out to us.</p>
                                <div style="display: flex; gap: 2rem; margin: 2rem 0; flex-wrap: wrap;">
                                  <div style="flex: 1; background: #fff3f3; padding: 1.5rem; border-radius: 12px; border-left: 4px solid #ef4444;">
                                    <h3 style="margin-top:0; color: #ef4444;">Before</h3>
                                    <p style="font-size: 2rem; font-weight: bold; margin: 0;">120 AQI</p>
                                    <p>Unhealthy indoor air</p>
                                  </div>
                                  <div style="flex: 1; background: #f0fdf4; padding: 1.5rem; border-radius: 12px; border-left: 4px solid #22c55e;">
                                    <h3 style="margin-top:0; color: #22c55e;">After</h3>
                                    <p style="font-size: 2rem; font-weight: bold; margin: 0;">25 AQI</p>
                                    <p>Clean, healthy environment</p>
                                  </div>
                                </div>
                                <h2>The Solution</h2>
                                <p>We implemented our [Product Name] across their facility, providing real-time monitoring and advanced filtration...</p>
                                <div style="border: 2px dashed #ccc; padding: 40px; text-align: center; background: #f9f9f9; margin: 2rem 0; border-radius: 8px;">[ Insert Image of Installed Product Here ]</div>
                                <blockquote style="border-left: 4px solid #74b75c; padding-left: 1rem; margin: 2rem 0; font-size: 1.2rem; font-style: italic; color: #444;">
                                  "The difference was noticeable within hours. Our employees are healthier and more productive." <br>
                                  <span style="font-size: 0.9rem; font-weight: bold; font-style: normal; color: #888;">— [Client Name / Title]</span>
                                </blockquote>
                                <p><br></p>
                              `);
                            }
                          }
                        ];
                        callback(items);
                      }
                    });
                  },
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <select 
                  className="input-text" 
                  style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', cursor: 'pointer' }}
                  onChange={(e) => {
                    if (e.target.value && !categories.includes(e.target.value)) {
                      setCategories([...categories, e.target.value]);
                    }
                    e.target.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select an existing category...</option>
                  {existingCategories.map((cat, i) => (
                    <option key={i} value={cat}>{cat}</option>
                  ))}
                </select>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>- OR CREATE NEW -</div>
                <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                    placeholder="Type new category..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                  <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem' }}>+</button>
                </form>
              </div>
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
              <label className="form-label">Placement</label>
              <select className="input-text" style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', backgroundColor: '#fff' }} value={promoPlacement} onChange={(e) => setPromoPlacement(e.target.value)}>
                <option value="sidebar">Sidebar</option>
                <option value="post_top">Inside Post (Top)</option>
                <option value="post_bottom">Inside Post (Bottom)</option>
              </select>
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

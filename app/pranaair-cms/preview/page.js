import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import BannerSettings from '../../../models/BannerSettings';
import Link from 'next/link';
import BlogImage from '../../../components/blog/BlogImage';
import '../blog.css';
import TableOfContents from '../../../components/blog/TableOfContents';
import RichContent from '../../../components/blog/RichContent';
import SocialSidebar from '../../../components/blog/SocialSidebar';
import TrendingWidget from '../../../components/blog/TrendingWidget';
import MobileSidebarWrapper from '../../../components/blog/MobileSidebarWrapper';
import PostViewTracker from '../../../components/blog/PostViewTracker';
import mongoose from 'mongoose';

function translatePost(post, lang) {
  if (!lang || lang === 'en') return post;

  const translations = post.translations;
  if (!translations) return post;

  const t = translations.get ? translations.get(lang) : translations[lang];
  if (!t) return post;

  return {
    ...post,
    title: t.title || post.title,
    content: t.content || post.content,
    excerpt: t.excerpt || post.excerpt,
    seo: {
      title: t.seo?.title || post.seo?.title,
      description: t.seo?.description || post.seo?.description,
      keywords: t.seo?.keywords || post.seo?.keywords || [],
    }
  };
}

export async function generateMetadata() {
  return {
    title: 'Post Preview | Prana Air Blog CMS (Internal)',
    description: 'Internal preview mode for Prana Air Blog posts.',
    robots: {
      index: false,
      follow: false,
      nocache: true,
      noarchive: true,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      }
    },
  };
}

export default async function WordPressStylePreviewPage(props) {
  const searchParams = await props.searchParams;
  const postId = searchParams?.id || searchParams?.p;
  const postSlug = searchParams?.slug;
  const lang = searchParams?.lang || 'en';

  await connectDB();

  let rawPost = null;

  // 1. Fetch by MongoDB ObjectId if provided (WordPress-style ?id=... or ?p=...)
  if (postId && mongoose.Types.ObjectId.isValid(postId)) {
    rawPost = await Post.findById(postId);
  }

  // 2. Fallback by slug or string ID
  if (!rawPost && postId) {
    rawPost = await Post.findOne({ $or: [{ _id: postId }, { slug: postId }] }).catch(() => null);
  }

  if (!rawPost && postSlug) {
    rawPost = await Post.findOne({ slug: postSlug });
  }

  // If still not found, show friendly preview placeholder
  if (!rawPost) {
    return (
      <div className="editorial-page-wrapper" style={{ padding: '6rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', background: '#fff', padding: '3rem 2rem', borderRadius: '20px', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#18181b', marginBottom: '0.75rem' }}>Post Preview Not Found</h2>
          <p style={{ color: '#71717a', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '2rem' }}>
            Could not find the requested post preview. Please verify the post ID or return to the dashboard.
          </p>
          <Link href="/cms/admin/dashboard" className="btn-back-blogs">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Fetch 3 related posts for bottom section & fallback trending widget
  const rawRelated = await Post.find({ _id: { $ne: rawPost._id } })
    .sort({ publishedAt: -1 })
    .limit(3)
    .lean();

  const relatedPosts = (rawRelated || []).map((rp) => {
    let obj = rp;
    if (obj.translations instanceof Map) {
      obj.translations = Object.fromEntries(obj.translations);
    }
    const plainObj = JSON.parse(JSON.stringify(obj));
    return translatePost(plainObj, lang);
  });

  const clientFallbackPosts = relatedPosts.map((rp) => ({
    slug: rp.slug,
    title: rp.title || '',
    featuredImage: rp.featuredImage || '',
    publishedAt: rp.publishedAt ? String(rp.publishedAt) : ''
  }));

  let promotions = [];
  if (rawPost.promotion && rawPost.promotion.isActive && rawPost.promotion.endDate) {
    if (new Date(rawPost.promotion.endDate) >= new Date()) {
      promotions.push(rawPost.promotion);
    }
  }

  if (promotions.length === 0) {
    const banners = await BannerSettings.find({});
    if (rawPost.categories && rawPost.categories.length > 0) {
      for (const cat of rawPost.categories) {
        const catBanners = banners.filter(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
        for (const catBanner of catBanners) {
          if (new Date(catBanner.promotion.endDate) >= new Date()) {
            if (!promotions.some(p => p.imageUrl === catBanner.promotion.imageUrl && p.text === catBanner.promotion.text)) {
              promotions.push(catBanner.promotion);
            }
          }
        }
      }
    }

    if (promotions.length === 0) {
      const globalBanner = banners.find(b => b.type === 'global' && b.promotion?.isActive);
      if (globalBanner && new Date(globalBanner.promotion.endDate) >= new Date()) {
        promotions.push(globalBanner.promotion);
      }
    }
  }

  let pObj = rawPost.toObject ? rawPost.toObject() : rawPost;
  if (pObj.translations instanceof Map) {
    pObj.translations = Object.fromEntries(pObj.translations);
  }
  const p = JSON.parse(JSON.stringify(pObj));
  const post = translatePost(p, lang);

  const calculateReadingTime = (text) => {
    const wordsPerMinute = 200;
    const noOfWords = text ? text.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length : 0;
    const minutes = Math.ceil(noOfWords / wordsPerMinute);
    return minutes > 0 ? minutes : 1;
  };

  const sidebarPromotions = promotions.filter(p => !p.placement || p.placement === 'sidebar');
  const topPromotions = promotions.filter(p => p.placement === 'post_top');
  const bottomPromotions = promotions.filter(p => p.placement === 'post_bottom');

  const renderBanner = (promo, idx) => (
    <a
      key={idx}
      href={promo.link}
      target="_blank"
      rel="noopener noreferrer"
      className="promotion-banner-card"
    >
      <div className="promo-badge">Featured</div>
      <div className="promo-img-wrap">
        <img src={promo.imageUrl} alt={promo.text || "Promotion"} />
      </div>
      <div className="promo-body">
        <div className="promo-title">{promo.text}</div>
        <div className="promo-btn">
          Learn More
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"></path>
            <path d="M12 5l7 7-7 7"></path>
          </svg>
        </div>
      </div>
    </a>
  );

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const clientTrackerPost = {
    slug: post.slug,
    title: post.title || '',
    featuredImage: post.featuredImage || '',
    publishedAt: post.publishedAt ? String(post.publishedAt) : ''
  };

  const cmsSlug = process.env.NEXT_PUBLIC_CMS_SLUG || 'pranaair-cms';

  return (
    <div className="editorial-page-wrapper">
      <PostViewTracker post={clientTrackerPost} />

      <div className="editorial-container">

        {/* Back Link */}
        <div className="editorial-back-link">
          <Link href="/cms/admin/dashboard" className="btn-back-blogs">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Dashboard
          </Link>
        </div>

        {/* Hero Section */}
        <div className="editorial-hero-section">
          {/* Category Badges */}
          {post.categories && post.categories.length > 0 && (
            <div className="editorial-categories">
              {post.categories.map((cat, i) => (
                <span key={i} className="editorial-badge">{cat}</span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="editorial-title">{post.title}</h1>

          {/* Metadata */}
          <div className="editorial-meta">
            <span className="meta-author">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {post.author || 'Admin'}
            </span>
            <span className="dot-divider">·</span>
            <span className="meta-date">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              {formatDate(post.publishedAt)}
            </span>
            <span className="dot-divider">·</span>
            <span className="meta-time">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              {calculateReadingTime(post.content)} Min Read
            </span>
          </div>

          {/* Featured Hero Image */}
          {post.featuredImage && (
            <div className="editorial-hero-image">
              <BlogImage
                post={post}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>

        {/* 3-Column Grid for Content & Sidebars */}
        <div className="editorial-grid">

          {/* Left Column: Floating Social Share */}
          <aside className="editorial-left-col">
            <SocialSidebar url={`https://www.pranaair.com/blog/${post.slug}`} title={post.title} />
          </aside>

          {/* Middle Column: Main Content */}
          <main className="editorial-main-col">
            <article className="editorial-article">

              {topPromotions.length > 0 && (
                <div className="editorial-top-promotions">
                  {topPromotions.map((promo, idx) => renderBanner(promo, `top-${idx}`))}
                </div>
              )}

              <RichContent
                html={post.content
                  .replace(/(https?:\/\/)?(www\.)?prana-air-blog\.vercel\.app\/?(?:test-blog\/|blog\/)?/gi, '/')
                  .replace(/(https?:\/\/)?(www\.)?dev\.pranaair\.com\/?(?:test-blog\/|blog\/)?/gi, '/')
                  .replace(/(?:\.\.\/)+uploads\//gi, '/cms/uploads/')
                  .replace(/([^"'\s=]*?)\/?(?<!wp-content\/)uploads\/([^"'\s>]+)/gi, '/cms/uploads/$2')
                  .replace(
                    /([^"'\s=]*?)\/?wp-content\/uploads\/([^"'\s>]+)/gi,
                    process.env.NEXT_PUBLIC_DOMAIN 
                      ? `${process.env.NEXT_PUBLIC_DOMAIN.replace(/\/cms\/?$/, '')}/blog/wp-content/uploads/$2`
                      : '/cms/wp-content/uploads/$2'
                  )
                  .replace(/\s+srcset="[^"]*"/gi, '')
                  .replace(/\s+sizes="[^"]*"/gi, '')}
              />

              {bottomPromotions.length > 0 && (
                <div className="editorial-bottom-promotions">
                  {bottomPromotions.map((promo, idx) => renderBanner(promo, `bottom-${idx}`))}
                </div>
              )}

              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div className="editorial-tags">
                  <span className="tags-label">Tags:</span>
                  {post.tags.map((tag, i) => (
                    <span key={i} className="editorial-tag-capsule">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Author Box */}
              <div className="editorial-author-box">
                <div className="author-avatar-wrap">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </div>
                <div className="author-details">
                  <h4 className="author-heading">Written by</h4>
                  <h5 className="author-name">{post.author || 'Admin'}</h5>
                  <p className="author-bio">Dedicated to providing clean air solutions and education for healthier living environments.</p>
                </div>
              </div>

            </article>
          </main>

          {/* Right Column: Table of Contents & Trending / Promotion */}
          <aside className="editorial-right-col">
            <div className="sticky-sidebar">
              <TableOfContents contentSelector=".editorial-content" />

              <TrendingWidget 
                lang={lang} 
                title="Trending Articles" 
                fallbackPosts={clientFallbackPosts} 
              />

              {sidebarPromotions.length > 0 && sidebarPromotions.map((promo, idx) => renderBanner(promo, `sidebar-${idx}`))}
            </div>
          </aside>

        </div>

        {/* Mobile Floating Drawer for TOC & Widgets */}
        <MobileSidebarWrapper buttonText="Explore Article & Topics">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <TableOfContents contentSelector=".editorial-content" />
            <TrendingWidget 
              lang={lang} 
              title="Trending Articles" 
              fallbackPosts={clientFallbackPosts} 
            />
            {sidebarPromotions.length > 0 && sidebarPromotions.map((promo, idx) => renderBanner(promo, `m-sidebar-${idx}`))}
          </div>
        </MobileSidebarWrapper>

        {/* Related Posts Section */}
        {relatedPosts && relatedPosts.length > 0 && (
          <div className="editorial-related-section">
            <div className="related-header">
              <h3 className="related-title">Recent Articles</h3>
              <Link href="/cms/admin/dashboard" className="related-view-all">
                All articles &rarr;
              </Link>
            </div>
            <div className="related-grid">
              {relatedPosts.map((relatedPost) => (
                <Link
                  key={relatedPost.slug}
                  href={`/${cmsSlug}/preview?id=${relatedPost._id}`}
                  className="related-card group"
                >
                  <div className="related-img-wrapper">
                    <BlogImage
                      post={relatedPost}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                  <div className="related-meta">
                    {relatedPost.categories?.[0] || 'Article'} &middot; {calculateReadingTime(relatedPost.content)} Min Read
                  </div>
                  <h4 className="related-post-title">
                    {relatedPost.title}
                  </h4>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

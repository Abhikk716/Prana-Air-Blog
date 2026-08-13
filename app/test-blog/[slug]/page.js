import { notFound } from 'next/navigation';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import BannerSettings from '../../../models/BannerSettings';
import Link from 'next/link';
import BlogImage from '../BlogImage';
import '../blog.css';
import TableOfContents from '../components/TableOfContents';
import RichContent from '../components/RichContent';

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

// Generate dynamic SEO metadata for each individual post
export async function generateMetadata(props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { slug } = params;
  const lang = searchParams?.lang || 'en';

  await connectDB();
  let post = await Post.findOne({ slug });

  if (!post) {
    return {
      title: 'Post Not Found | Prana Air Blog',
      description: 'The requested blog post was not found.'
    };
  }

  // Translate post data
  const p = post.toObject ? post.toObject() : post;
  post = translatePost(p, lang);

  const pageTitle = post.seo?.title || post.title;
  const pageDescription = post.seo?.description || post.excerpt || '';
  let postImage = post.featuredImage || '/uploads/featured/placeholder.jpg';
  
  // Remove the Vercel domain completely for SEO so it becomes a relative path
  postImage = postImage.replace(/^https?:\/\/prana-air-blog\.vercel\.app/i, '');

  const siteDomain = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.pranaair.com';
  // Ensure postImage is an absolute URL for OpenGraph/Twitter
  const absolutePostImage = postImage.startsWith('http') ? postImage : `${siteDomain}${postImage.startsWith('/') ? '' : '/'}${postImage}`;
  
  const canonicalUrl = `${siteDomain}/blog/${post.slug}${lang !== 'en' ? `?lang=${lang}` : ''}`;

  return {
    title: `${pageTitle} | Prana Air Blog`,
    description: pageDescription.substring(0, 160),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: pageDescription,
      url: canonicalUrl,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author || 'Admin'],
      images: [
        {
          url: absolutePostImage,
          alt: post.title,
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: pageDescription,
      images: [absolutePostImage],
    }
  };
}

export default async function BlogPostPage(props) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { slug } = params;
  const lang = searchParams?.lang || 'en';

  await connectDB();
  const rawPost = await Post.findOne({ slug });

  // If post is not found, return 404
  if (!rawPost) {
    notFound();
  }

  let promotions = [];
  if (rawPost.promotion && rawPost.promotion.isActive && rawPost.promotion.endDate) {
    if (new Date(rawPost.promotion.endDate) >= new Date()) {
      promotions.push(rawPost.promotion);
    }
  }

  if (promotions.length === 0) {
    const banners = await BannerSettings.find({});
    
    // Check Category Banners First
    if (rawPost.categories && rawPost.categories.length > 0) {
      for (const cat of rawPost.categories) {
        const catBanners = banners.filter(b => b.type === 'category' && b.categories?.includes(cat) && b.promotion?.isActive);
        for (const catBanner of catBanners) {
          if (new Date(catBanner.promotion.endDate) >= new Date()) {
            // Avoid duplicates
            if (!promotions.some(p => p.imageUrl === catBanner.promotion.imageUrl && p.text === catBanner.promotion.text)) {
              promotions.push(catBanner.promotion);
            }
          }
        }
      }
    }

    // Check Global Banner if still no promotion
    if (promotions.length === 0) {
      const globalBanner = banners.find(b => b.type === 'global' && b.promotion?.isActive);
      if (globalBanner && new Date(globalBanner.promotion.endDate) >= new Date()) {
        promotions.push(globalBanner.promotion);
      }
    }
  }

  const p = JSON.parse(JSON.stringify(rawPost.toObject ? rawPost.toObject() : rawPost));
  const post = translatePost(p, lang);

  const calculateReadingTime = (text) => {
    const wordsPerMinute = 200;
    const noOfWords = text ? text.split(/\s+/).length : 0;
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
      style={{ marginBottom: '1.5rem', display: 'block' }}
    >
      <div style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', fontWeight: '700', letterSpacing: '0.05em', textTransform: 'uppercase', backdropFilter: 'blur(4px)', zIndex: 2 }}>
        Featured
      </div>
      <div style={{ width: '100%', aspectRatio: '16/10', overflow: 'hidden' }}>
        <img src={promo.imageUrl} alt="Promotion" />
      </div>
      <div style={{ padding: '1.25rem', background: '#ffffff', borderTop: '3px solid #74b75c' }}>
        <div style={{ color: '#1f2937', fontWeight: 800, fontSize: '1.05rem', lineHeight: '1.4', marginBottom: '0.75rem' }}>
          {promo.text}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#74b75c', fontSize: '0.85rem', fontWeight: 700 }}>
          Learn More
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
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

  return (
    <div className="editorial-page-wrapper">
      <div className="editorial-container">

        {/* Back Link */}
        <div className="editorial-back-link">
          <Link href={`/admin/dashboard`} className="btn-back-blogs">
            &larr; Back to Dashboard
          </Link>
        </div>

        {/* Hero Section (Full Width / Centered) */}
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
          <h1 className="editorial-title text-center">{post.title}</h1>

          {/* Metadata */}
          <div className="editorial-meta justify-center" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              {post.author || 'Admin'}
            </span>
            <span className="dot-divider">·</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              {formatDate(post.publishedAt)}
            </span>
            <span className="dot-divider">·</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              {calculateReadingTime(post.content)} Min Read
            </span>
          </div>

          {/* Featured Image */}
          {post.featuredImage && (
            <div className="editorial-hero-image">
              <BlogImage
                post={post}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>


        {/* 3-Column Grid for Content */}
        <div className="editorial-grid">

          {/* Left Column: Empty */}
          <aside className="editorial-left-col">
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
                  .replace(
                    /(?:https?:\/\/[^\/]+)?\/?wp-content\/uploads\/([^"'\s>]+)/gi,
                    (match, filePart) => {
                      return `/wp-content/uploads/${filePart}`;
                    }
                  )
                  .replace(/https?:\/\/prana-air-blog\.vercel\.app/gi, '')}
              />

              {bottomPromotions.length > 0 && (
                <div className="editorial-bottom-promotions" style={{ marginTop: '2rem' }}>
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
                <h4 className="author-heading">Written by</h4>
                <div className="author-details">
                  <h5 className="author-name">{post.author || 'Admin'}</h5>
                  <p className="author-bio">Dedicated to providing clean air solutions and education for healthier living environments.</p>
                </div>
              </div>

            </article>
          </main>

          {/* Right Column: Table of Contents & Promotion Banner */}
          <aside className="editorial-right-col">
            <div className="sticky-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              <TableOfContents contentSelector=".editorial-content" />

              {sidebarPromotions.length > 0 && sidebarPromotions.map((promo, idx) => renderBanner(promo, `sidebar-${idx}`))}
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

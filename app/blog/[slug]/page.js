import { notFound } from 'next/navigation';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';

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
  const postImage = post.featuredImage || '/uploads/featured/placeholder.jpg';

  return {
    title: `${pageTitle} | Prana Air Blog`,
    description: pageDescription.substring(0, 160),
    alternates: {
      canonical: `http://localhost:3000/blog/${post.slug}${lang !== 'en' ? `?lang=${lang}` : ''}`, // Replace with your production domain
    },
    openGraph: {
      title: post.title,
      description: pageDescription,
      url: `http://localhost:3000/blog/${post.slug}${lang !== 'en' ? `?lang=${lang}` : ''}`,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author || 'Admin'],
      images: [
        {
          url: postImage,
          alt: post.title,
        }
      ]
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: pageDescription,
      images: [postImage],
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

  // If post is not found or is in draft mode, return 404
  if (!rawPost || rawPost.status !== 'published') {
    notFound();
  }

  const p = rawPost.toObject ? rawPost.toObject() : rawPost;
  const post = translatePost(p, lang);

  // Formatting date helper
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const languageLabels = {
    en: 'English',
    hi: 'Hindi (हिन्दी)',
    es: 'Spanish (Español)',
    de: 'German (Deutsch)',
    fr: 'French (Français)',
    ru: 'Russian (Русский)',
    ja: 'Japanese (日本語)'
  };

  const translationsExist = [{ code: 'en', label: 'English' }];
  for (const code of ['hi', 'es', 'de', 'fr', 'ru', 'ja']) {
    if (p.translations && (p.translations[code] || (p.translations.get && p.translations.get(code)))) {
      translationsExist.push({ code, label: languageLabels[code] });
    }
  }

  return (
    <article className="article-container">
      {/* Article Header Metadata */}
      <header className="article-header">
        <div className="article-meta">
          <span className="author-info">By {post.author || 'Admin'}</span>
          <span className="divider"></span>
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        </div>

        {/* Translation Selector Tabs */}
        {translationsExist.length > 1 && (
          <div className="article-languages" style={{
            margin: '1.25rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
            fontSize: '0.85rem',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '1rem'
          }}>
            <span style={{ color: '#64748b', fontWeight: 600, marginRight: '0.25rem' }}>Read in:</span>
            {translationsExist.map((t) => (
              <a
                key={t.code}
                href={`/blog/${slug}${t.code !== 'en' ? `?lang=${t.code}` : ''}`}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  backgroundColor: lang === t.code ? '#74b75c' : '#f1f5f9',
                  color: lang === t.code ? 'white' : '#475569',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  border: lang === t.code ? '1px solid #74b75c' : '1px solid #e2e8f0',
                  boxShadow: lang === t.code ? '0 4px 6px rgba(116, 183, 92, 0.2)' : 'none'
                }}
              >
                {t.label}
              </a>
            ))}
          </div>
        )}
        
        <h1 className="article-title">{post.title}</h1>

        {/* Categories Badges */}
        {post.categories && post.categories.length > 0 && (
          <div className="article-categories">
            {post.categories.map((cat, i) => (
              <span key={i} className="badge">{cat}</span>
            ))}
          </div>
        )}
      </header>

      {/* Featured Banner Image */}
      {post.featuredImage && (
        <div className="article-featured-img-wrapper">
          <img
            src={post.featuredImage}
            alt={post.title}
            className="article-featured-img"
            loading="eager"
          />
        </div>
      )}

      {/* Safe HTML Content Rendering */}
      <div
        className="article-body"
        dangerouslySetInnerHTML={{ __html: post.content }}
      />

      {/* Tags Section */}
      {post.tags && post.tags.length > 0 && (
        <div className="article-tags-wrapper">
          <span className="article-tags-title">Tags:</span>
          <div className="article-tags">
            {post.tags.map((tag, i) => (
              <a
                key={i}
                href={`/?search=${encodeURIComponent(tag)}`}
                className="tag-badge-simple"
              >
                #{tag}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

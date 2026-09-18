import connectDB from '../../../../lib/db';
import Post from '../../../../models/post';
import { getBlogAnalytics } from '../../../../lib/ga4';

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// GET /api/posts/meta?lang=... - Returns categories, popular posts (language-aware GA4 analytics), trending tags
// Used by the main website blog page and inner blog sidebar
export async function GET(request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const rawLang = (searchParams.get('lang') || 'all').trim();
    const isGlobalOrAll = !rawLang || rawLang === 'all' || rawLang === 'en';
    const lang = rawLang;
    const englishVariants = ['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'en'];
    const isEnglishVariant = englishVariants.includes(lang.toLowerCase());

    // Category counts
    const allPublished = await Post.find({ status: 'published' }, 'categories');
    const categoryCounts = {};
    allPublished.forEach(post => {
      if (post.categories) {
        post.categories.forEach(cat => {
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      }
    });
    const categories = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .filter(cat => cat.name !== 'カテゴリーなし' && cat.name !== 'Uncategorized')
      .sort((a, b) => b.count - a.count);

    // Trending / Popular posts from Google Analytics 4 (scoped to language)
    let popularPosts = [];
    try {
      const gaRes = await getBlogAnalytics({ mode: 'lifetime', lang: isGlobalOrAll ? 'all' : lang });
      const gaSlugs = (gaRes.bySlug || [])
        .map(s => s.slug?.trim())
        .filter(Boolean);

      if (gaSlugs.length > 0) {
        const matchedPosts = await Post.find(
          { slug: { $in: gaSlugs.slice(0, 60) }, status: 'published' },
          'slug title publishedAt featuredImage excerpt author categories translations'
        ).lean();

        const postMap = new Map(matchedPosts.map(p => [p.slug, p]));
        for (const item of (gaRes.bySlug || [])) {
          if (!item.slug) continue;
          const found = postMap.get(item.slug);
          if (!found) continue;

          let localizedTitle = found.title;
          let localizedExcerpt = found.excerpt;
          let localizedSlug = found.slug;
          let localizedImage = found.featuredImage;
          let hasTranslation = isEnglishVariant || isGlobalOrAll;

          if (!isGlobalOrAll && !isEnglishVariant && found.translations) {
            const trans = found.translations instanceof Map
              ? found.translations.get(lang)
              : found.translations[lang];
            if (trans && trans.title) {
              hasTranslation = true;
              localizedTitle = trans.title;
              if (trans.excerpt) localizedExcerpt = trans.excerpt;
              if (trans.slug) localizedSlug = trans.slug;
              if (trans.featuredImage) localizedImage = trans.featuredImage;
            }
          }

          if (hasTranslation && !popularPosts.some(p => (p.originalSlug || p.slug) === found.slug)) {
            popularPosts.push({
              _id: String(found._id),
              slug: localizedSlug,
              originalSlug: found.slug,
              title: localizedTitle,
              publishedAt: found.publishedAt,
              featuredImage: localizedImage,
              excerpt: localizedExcerpt,
              author: found.author,
              categories: found.categories,
              views: item.views,
            });
          }
          if (popularPosts.length >= 10) break;
        }
      }
    } catch (gaErr) {
      console.warn('GA4 fetch in meta route fallback to DB:', gaErr.message);
    }

    // Fallback to global GA4 if fewer than 6 posts found for this language
    if (popularPosts.length < 6 && !isGlobalOrAll) {
      try {
        const globalGaRes = await getBlogAnalytics({ mode: 'lifetime', lang: 'all' });
        const globalSlugs = (globalGaRes.bySlug || []).map(s => s.slug?.trim()).filter(Boolean);
        if (globalSlugs.length > 0) {
          const matchedGlobal = await Post.find(
            { slug: { $in: globalSlugs.slice(0, 60) }, status: 'published' },
            'slug title publishedAt featuredImage excerpt author categories translations'
          ).lean();
          const globalMap = new Map(matchedGlobal.map(p => [p.slug, p]));
          const existingSlugs = new Set(popularPosts.map(p => p.originalSlug || p.slug));

          for (const item of (globalGaRes.bySlug || [])) {
            if (!item.slug || existingSlugs.has(item.slug)) continue;
            const found = globalMap.get(item.slug);
            if (!found) continue;

            let localizedTitle = found.title;
            let localizedExcerpt = found.excerpt;
            let localizedSlug = found.slug;
            let localizedImage = found.featuredImage;
            let hasTranslation = isEnglishVariant;

            if (!isEnglishVariant && found.translations) {
              const trans = found.translations instanceof Map ? found.translations.get(lang) : found.translations[lang];
              if (trans && trans.title) {
                hasTranslation = true;
                localizedTitle = trans.title;
                if (trans.excerpt) localizedExcerpt = trans.excerpt;
                if (trans.slug) localizedSlug = trans.slug;
                if (trans.featuredImage) localizedImage = trans.featuredImage;
              }
            }

            if (hasTranslation) {
              popularPosts.push({
                _id: String(found._id),
                slug: localizedSlug,
                originalSlug: found.slug,
                title: localizedTitle,
                publishedAt: found.publishedAt,
                featuredImage: localizedImage,
                excerpt: localizedExcerpt,
                author: found.author,
                categories: found.categories,
                views: item.views,
              });
              existingSlugs.add(found.slug);
            }
            if (popularPosts.length >= 10) break;
          }
        }
      } catch (err) {
        console.warn('Global GA4 fallback error:', err.message);
      }
    }

    // Fallback if still fewer than 6 posts
    if (popularPosts.length < 6) {
      const fallbackRaw = await Post.find(
        { status: 'published' },
        'slug title publishedAt featuredImage excerpt author categories translations'
      )
        .sort({ views: -1, publishedAt: -1 })
        .limit(20)
        .lean();

      const existingSlugs = new Set(popularPosts.map(p => p.originalSlug || p.slug));
      for (const p of fallbackRaw) {
        if (existingSlugs.has(p.slug)) continue;
        let localizedTitle = p.title;
        let localizedExcerpt = p.excerpt;
        let localizedSlug = p.slug;
        let localizedImage = p.featuredImage;
        let hasTranslation = isEnglishVariant || isGlobalOrAll;

        if (!isGlobalOrAll && !isEnglishVariant && p.translations) {
          const trans = p.translations instanceof Map ? p.translations.get(lang) : p.translations[lang];
          if (trans && trans.title) {
            hasTranslation = true;
            localizedTitle = trans.title;
            if (trans.excerpt) localizedExcerpt = trans.excerpt;
            if (trans.slug) localizedSlug = trans.slug;
            if (trans.featuredImage) localizedImage = trans.featuredImage;
          }
        }

        if (hasTranslation || isGlobalOrAll) {
          popularPosts.push({
            _id: String(p._id),
            slug: localizedSlug,
            originalSlug: p.slug,
            title: localizedTitle,
            publishedAt: p.publishedAt,
            featuredImage: localizedImage,
            excerpt: localizedExcerpt,
            author: p.author,
            categories: p.categories,
          });
          existingSlugs.add(p.slug);
        }
        if (popularPosts.length >= 10) break;
      }
    }

    // Trending tags (top 12 unique tags)
    const uniqueTags = await Post.distinct('tags', { status: 'published' });
    const trendingTags = uniqueTags.slice(0, 12);

    return Response.json({
      success: true,
      data: {
        totalPublished: allPublished.length,
        categories,
        popularPosts,
        trendingTags,
      }
    }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Error fetching meta:', error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}


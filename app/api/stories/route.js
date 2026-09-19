import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import Post from '../../../models/post';
import BannerSettings from '../../../models/BannerSettings';

// CORS headers & Edge Caching – allow main blog frontend to fetch stories with high performance
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get('postId');
    const slug = searchParams.get('slug');

    const now = new Date();

    const lang = searchParams.get('lang') || 'en';

    // 1. Fetch active story posts from Post collection
    const postQuery = {
      'story.isActive': true,
      $or: [
        { 'story.endDate': null },
        { 'story.endDate': { $gte: now } }
      ]
    };

    const storyPosts = await Post.find(postQuery)
      .select('title slug featuredImage story categories publishedAt translations')
      .sort({ 'story.order': 1, updatedAt: -1 })
      .lean();

    // Dynamically detect CMS domain (works on both localhost, dev, and production deployment)
    const host = req.headers.get('host');
    const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const cmsOrigin = process.env.NEXT_PUBLIC_DOMAIN || process.env.NEXT_PUBLIC_CMS_ORIGIN || (host ? `${proto}://${host}` : '');

    const formatImageUrl = (url) => {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://')) return url;

      const cmsBase = process.env.NEXT_PUBLIC_DOMAIN 
        ? `${process.env.NEXT_PUBLIC_DOMAIN.replace(/\/+$/, '').replace(/\/cms$/, '')}/cms`
        : (cmsOrigin ? `${cmsOrigin.replace(/\/+$/, '').replace(/\/cms$/, '')}/cms` : '/cms');

      if (url.includes('wp-content/uploads/')) {
        const match = url.match(/wp-content\/uploads\/.*/);
        if (match) return `${cmsBase}/${match[0]}`;
      }

      if (url.includes('uploads/')) {
        const match = url.match(/uploads\/.*/);
        if (match) return `${cmsBase}/${match[0]}`;
      }

      const cleanPath = url.startsWith('/') ? url : `/${url}`;
      return cleanPath.startsWith('/cms/') ? `${cmsBase.replace(/\/cms$/, '')}${cleanPath}` : `${cmsBase}${cleanPath}`;
    };

    const getTranslatedTitle = (p) => {
      if (lang && lang !== 'en' && p.translations) {
        const t = p.translations[lang] || (p.translations.get ? p.translations.get(lang) : null);
        if (t && t.title) return t.title;
      }
      return p.story?.title || p.title || '';
    };

    const formattedPostStories = (storyPosts || []).map(p => ({
      id: p._id.toString(),
      title: getTranslatedTitle(p),
      imageUrl: formatImageUrl(p.story?.imageUrl || p.featuredImage || ''),
      link: p.story?.link || (lang === 'en' ? `/test-blog/${p.slug}` : `/test-blog/${lang}/${p.slug}`),
      endDate: p.story?.endDate || null,
      type: 'post',
      slug: p.slug,
      categories: p.categories || []
    })).filter(s => s.imageUrl && s.imageUrl.trim() !== '');

    // 2. Fetch active story campaigns from BannerSettings
    const bannerQuery = {
      $or: [
        { type: 'story' },
        { 'promotion.placement': 'story' }
      ],
      'promotion.isActive': true,
      $or: [
        { 'promotion.endDate': null },
        { 'promotion.endDate': { $gte: now } }
      ]
    };

    const storyBanners = await BannerSettings.find(bannerQuery).lean();

    const formattedBannerStories = (storyBanners || []).map(b => ({
      id: b._id.toString(),
      title: b.name || b.promotion?.text || 'Featured Story',
      imageUrl: formatImageUrl(b.promotion?.imageUrl || ''),
      link: b.promotion?.link || '#',
      endDate: b.promotion?.endDate || null,
      type: 'campaign',
      targetPosts: b.targetPosts || [],
      categories: b.categories || []
    })).filter(s => s.imageUrl && s.imageUrl.trim() !== '');

    // Combine all stories
    let allStories = [...formattedPostStories, ...formattedBannerStories];

    // If filtered by specific post/slug (e.g. for inside a post)
    if (postId || slug) {
      allStories = allStories.filter(s => {
        if (s.type === 'post') {
          return (postId && s.id === postId) || (slug && s.slug === slug);
        }
        if (s.type === 'campaign') {
          if (!s.targetPosts || s.targetPosts.length === 0) return true; // global story
          return (postId && s.targetPosts.includes(postId)) || (slug && s.targetPosts.includes(slug));
        }
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      count: allStories.length,
      stories: allStories
    }, { headers: CORS_HEADERS });

  } catch (error) {
    console.error('Error fetching stories:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch stories',
      stories: []
    }, { status: 500, headers: CORS_HEADERS });
  }
}


import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/adminAuth';

// Looks up the original alt text of a migrated WordPress image in the
// source site's media library. Almost every featured image in this CMS
// still points at /wp-content/uploads/..., but the migration never carried
// the media library's alt_text across, so the editor can recover it here.
// Public WP REST endpoint, no credentials involved; runs server-side so the
// browser doesn't need CORS access to the WordPress host.

const DEFAULT_WP_API = 'https://www.pranaair.com/blog/wp-json/wp/v2';

// "photo-1024x683.jpg" / "photo-scaled.webp" / "photo.jpg" -> "photo"
function stemOf(fileName) {
  return (fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/-scaled$/i, '')
    .replace(/-\d+x\d+$/i, '')
    .toLowerCase();
}

function fileNameOf(url) {
  try {
    const path = /^https?:\/\//i.test(url) ? new URL(url).pathname : url.split('?')[0];
    return decodeURIComponent(path.split('/').pop() || '');
  } catch {
    return '';
  }
}

export async function GET(request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const src = (searchParams.get('src') || '').trim();
  if (!src) {
    return NextResponse.json({ success: false, error: 'Missing src' }, { status: 400 });
  }

  const fileName = fileNameOf(src);
  const stem = stemOf(fileName);
  if (!/wp-content\/uploads\//i.test(src) || !stem) {
    return NextResponse.json({
      success: true,
      alt: '',
      reason: 'Not a WordPress media library image, so there is no original alt text to recover.'
    });
  }

  const apiBase = (process.env.WP_API_URL || DEFAULT_WP_API).replace(/\/+$/, '');
  const url = `${apiBase}/media?search=${encodeURIComponent(stem)}&per_page=10&_fields=id,alt_text,source_url,title.rendered`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `WordPress media API responded ${res.status}.` }, { status: 502 });
    }
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: true, alt: '', reason: 'No matching image in the WordPress media library.' });
    }

    // Prefer the exact file, then the same image at another size, then any
    // hit that actually carries an alt.
    const withNames = items.map(item => ({
      alt: (item.alt_text || '').trim(),
      sourceUrl: item.source_url || '',
      title: item.title?.rendered || '',
      fileName: fileNameOf(item.source_url || '').toLowerCase()
    }));
    const wanted = fileName.toLowerCase();
    const match =
      withNames.find(i => i.fileName === wanted && i.alt) ||
      withNames.find(i => stemOf(i.fileName) === stem && i.alt) ||
      withNames.find(i => i.fileName === wanted) ||
      withNames.find(i => stemOf(i.fileName) === stem);

    if (!match) {
      return NextResponse.json({ success: true, alt: '', reason: 'No matching image in the WordPress media library.' });
    }
    if (!match.alt) {
      return NextResponse.json({ success: true, alt: '', matched: match.sourceUrl, reason: 'The image exists in WordPress but has no alt text there either.' });
    }
    return NextResponse.json({ success: true, alt: match.alt, matched: match.sourceUrl, title: match.title });
  } catch (err) {
    const timedOut = err?.name === 'AbortError';
    console.error('[media-alt] lookup failed:', err);
    return NextResponse.json({
      success: false,
      error: timedOut ? 'WordPress media API timed out.' : 'Could not reach the WordPress media API.'
    }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}

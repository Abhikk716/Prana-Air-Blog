// Google Analytics 4 reader for the admin analytics tab.
//
// Talks to the Analytics Data API (v1beta) over plain fetch. The only thing
// a client library would add is the OAuth token exchange, so that is done
// here with Node's crypto instead of pulling in google-auth-library.
//
// Credentials, first match wins:
//   1. GA4_CREDENTIALS_JSON            raw or base64 JSON of a service-account
//                                      key OR a gcloud "authorized_user" file
//                                      (use this on Vercel)
//   2. GOOGLE_APPLICATION_CREDENTIALS  path to such a file
//   3. ~/.config/gcloud/application_default_credentials.json
//                                      (what `gcloud auth application-default
//                                      login` / the analytics MCP setup writes,
//                                      so local dev works with no extra config)
//
// The property is GA4_PROPERTY_ID (numeric). Only the blog's paths are ever
// reported on: everything under /blog/ minus WordPress admin/technical URLs.
// A category is applied the same way — as a path filter built from the slugs
// of the posts in that category (GA knows nothing about CMS categories).

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const BLOG_PREFIX = '/blog/';
// WordPress admin, theme partials and feeds also live under /blog/.
const JUNK_RE = '^/blog/(wp-admin|wp-login|wp-json|wp-content|wp-includes|comp/|xmlrpc|feed)';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 40;
// Per-slug rows returned to the dashboard, which joins them to posts by slug.
// Posts live at /blog/<slug>/ (one segment), so archive paths such as
// category/x, tag/y, page/2 or 2021/09/27 are folded into the totals but
// never returned as slugs — that keeps every post inside the cap.
const MAX_SLUGS = 2000;
// Earliest start date the Data API accepts; lifetime reports start here and
// Google simply returns nothing for months before the property existed.
const GA_EPOCH = '2015-08-14';
const RECENT_DAYS = 30;

// pranaair.com serves every edition at /blog/<segment>/<slug>/ where the
// segment is the CMS language code in lower case; the base English post has
// no segment at all. (Checked against live GA paths.)
const EDITION_CODES = ['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'hi', 'es', 'de', 'fr', 'ru', 'ja', 'pt-PT'];
const SEGMENT_TO_CODE = Object.fromEntries(EDITION_CODES.map(c => [c.toLowerCase(), c]));
const EDITION_SEGMENT_RE = `^/blog/(${Object.keys(SEGMENT_TO_CODE).join('|')})/`;

export class GaConfigError extends Error {
  constructor(message) { super(message); this.code = 'not_configured'; }
}

/* ---------- credentials + token ---------- */

function parseJsonMaybeBase64(raw) {
  let s = String(raw).trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("'")) s = s.slice(1).trim();
  if (s.endsWith("'")) s = s.slice(0, -1).trim();
  try { return JSON.parse(s); } catch { /* try base64 */ }
  try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { /* fall through */ }
  throw new GaConfigError('GA4_CREDENTIALS_JSON is neither JSON nor base64-encoded JSON.');
}

async function loadCredentials() {
  if (process.env.GA4_CREDENTIALS_JSON) {
    return { creds: parseJsonMaybeBase64(process.env.GA4_CREDENTIALS_JSON), source: 'GA4_CREDENTIALS_JSON' };
  }
  const candidates = [];
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    candidates.push({ file: process.env.GOOGLE_APPLICATION_CREDENTIALS, source: 'GOOGLE_APPLICATION_CREDENTIALS' });
  }
  candidates.push({
    file: path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json'),
    source: 'gcloud application-default credentials'
  });
  for (const c of candidates) {
    try {
      return { creds: JSON.parse(await fs.readFile(c.file, 'utf8')), source: c.source };
    } catch (err) {
      if (err.code !== 'ENOENT') throw new GaConfigError(`Could not read Google credentials from ${c.source}: ${err.message}`);
    }
  }
  return null;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

async function exchangeToken(creds) {
  let body;
  const tokenUrl = creds.token_uri || TOKEN_URL;
  if (creds.type === 'service_account') {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: creds.client_email, scope: SCOPE, aud: tokenUrl, iat: now, exp: now + 3600 }));
    const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), creds.private_key);
    body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`
    });
  } else if (creds.type === 'authorized_user') {
    body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token
    });
  } else {
    throw new GaConfigError(`Unsupported Google credential type "${creds.type || 'unknown'}" (expected service_account or authorized_user).`);
  }

  const res = await fetch(tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`Google token exchange failed: ${json.error_description || json.error || `HTTP ${res.status}`}`);
  }
  return {
    token: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
    // User credentials need a project to bill quota against; the ADC file
    // carries one. Service accounts already belong to a project.
    quotaProject: creds.quota_project_id || process.env.GOOGLE_PROJECT_ID || ''
  };
}

let tokenCache = null;
let tokenInflight = null;

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 60 * 1000) return tokenCache;
  if (!tokenInflight) {
    tokenInflight = (async () => {
      const found = await loadCredentials();
      if (!found) {
        throw new GaConfigError('No Google credentials found. Set GA4_CREDENTIALS_JSON (or GOOGLE_APPLICATION_CREDENTIALS), or run `gcloud auth application-default login` locally.');
      }
      tokenCache = await exchangeToken(found.creds);
      return tokenCache;
    })().finally(() => { tokenInflight = null; });
  }
  return tokenInflight;
}

/* ---------- Data API ---------- */

async function gaPost(pathname, payload) {
  const auth = await getAccessToken();
  const headers = { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json' };
  if (auth.quotaProject) headers['x-goog-user-project'] = auth.quotaProject;
  const res = await fetch(`${DATA_API}/${pathname}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) tokenCache = null; // force a fresh exchange next time
    const err = new Error(`Google Analytics Data API: ${json.error?.message || `HTTP ${res.status}`}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// batchRunReports takes at most 5 requests; larger lists run as parallel batches.
export async function runReports(propertyId, requests) {
  const chunks = [];
  for (let i = 0; i < requests.length; i += 5) chunks.push(requests.slice(i, i + 5));
  const results = await Promise.all(chunks.map(c => gaPost(`properties/${propertyId}:batchRunReports`, { requests: c })));
  return results.flatMap(r => r.reports || []);
}

// Flatten a report into [{ <dimensionName>: string, <metricName>: number }].
function rowsOf(report) {
  const dims = (report.dimensionHeaders || []).map(h => h.name);
  const mets = (report.metricHeaders || []).map(h => h.name);
  return (report.rows || []).map(r => {
    const o = {};
    dims.forEach((n, i) => { o[n] = r.dimensionValues?.[i]?.value ?? ''; });
    mets.forEach((n, i) => { o[n] = Number(r.metricValues?.[i]?.value) || 0; });
    return o;
  });
}

const dim = (name) => ({ name });
const met = (name) => ({ name });
const strFilter = (fieldName, matchType, value) => ({ filter: { fieldName, stringFilter: { matchType, value } } });
const byMetricDesc = (metricName) => [{ metric: { metricName }, desc: true }];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Regex matching /blog/<slug>/ in any edition folder, for a set of slugs.
// GA shows percent-encoded slugs decoded, so both spellings are included.
// Google accepted a ~7 KB pattern in testing; the largest category is ~5 KB.
export function slugsPathRegex(slugs) {
  const variants = new Set();
  for (const slug of slugs) {
    if (!slug) continue;
    variants.add(escapeRe(slug));
    try { const decoded = decodeURIComponent(slug); if (decoded !== slug) variants.add(escapeRe(decoded)); } catch { /* keep raw */ }
  }
  return `^${escapeRe(BLOG_PREFIX)}(?:(?:${Object.keys(SEGMENT_TO_CODE).join('|')})/)?(?:${[...variants].join('|')})/?$`;
}

// Every request is scoped to blog paths. `lang` narrows to one edition:
// 'en' is the unprefixed base post, any other code its /blog/<code>/ folder.
// `slugs` (a category's posts) narrows to those posts in whatever edition.
function blogFilter(lang, slugs) {
  const expressions = [
    strFilter('pagePath', 'BEGINS_WITH', BLOG_PREFIX),
    { notExpression: strFilter('pagePath', 'PARTIAL_REGEXP', JUNK_RE) }
  ];
  if (lang && lang !== 'all') {
    if (lang === 'en') expressions.push({ notExpression: strFilter('pagePath', 'PARTIAL_REGEXP', EDITION_SEGMENT_RE) });
    else expressions.push(strFilter('pagePath', 'BEGINS_WITH', `${BLOG_PREFIX}${lang.toLowerCase()}/`));
  }
  if (slugs) expressions.push(strFilter('pagePath', 'FULL_REGEXP', slugsPathRegex(slugs)));
  return { andGroup: { expressions } };
}

// "/blog/hi/some-post/?x=1" -> { lang: 'hi', slug: 'some-post' }; "/blog/" -> { lang: 'en', slug: '' }
export function classifyBlogPath(pagePath) {
  let rest = pagePath.slice(BLOG_PREFIX.length).split(/[?#]/)[0];
  let lang = 'en';
  const m = /^([a-z]{2}(?:-[a-z]{2})?)\/(.*)$/i.exec(rest);
  if (m && SEGMENT_TO_CODE[m[1].toLowerCase()]) {
    lang = SEGMENT_TO_CODE[m[1].toLowerCase()];
    rest = m[2];
  }
  return { lang, slug: rest.replace(/\/+$/, '') };
}

const gaDay = (yyyymmdd) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
const gaMonth = (yyyymm) => `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;

function pickTotals(r = {}) {
  return {
    users: r.totalUsers || 0,
    newUsers: r.newUsers || 0,
    sessions: r.sessions || 0,
    pageViews: r.screenPageViews || 0,
    engagedSessions: r.engagedSessions || 0,
    engagementRate: r.engagementRate || 0,
    avgSessionDuration: r.averageSessionDuration || 0,
    engagementDuration: r.userEngagementDuration || 0
  };
}

/* ---------- the blog report ---------- */

// A dataset with nothing in it — used when a category has no posts, so the
// client still gets the normal shape without a round trip to Google.
export function emptyBlogAnalytics({ propertyId, mode = 'window', from, to, prevFrom, prevTo, lang = 'all', category = '' }) {
  return {
    propertyId: String(propertyId),
    range: { mode, from, to, prevFrom, prevTo, lang, category },
    totals: { current: pickTotals(), previous: pickTotals(), recent: pickTotals() },
    daily: [], monthly: [], bySlug: [], pathCount: 0, editions: {}, channels: [], countries: [], devices: [],
    fetchedAt: new Date().toISOString()
  };
}

// Two modes:
//   window   – `from`..`to` plus the equal-length period before it
//              (`prevFrom`..`prevTo`); daily series across both; `totals`
//              carries `current` and `previous`.
//   lifetime – everything Google has for the property; monthly series;
//              `totals` carries `current` (lifetime) and `recent` (last 30
//              days) so the tiles can show "+N in last 30 days".
// All dates are YYYY-MM-DD strings interpreted in the property's timezone.
// `slugs` is the optional list of post slugs to restrict to (a category).
export async function fetchBlogAnalytics({ propertyId, mode = 'window', from, to, prevFrom, prevTo, lang = 'all', category = '', slugs = null }) {
  const lifetime = mode === 'lifetime';
  const filter = blogFilter(lang, slugs);
  const cur = lifetime ? { startDate: GA_EPOCH, endDate: 'today' } : { startDate: from, endDate: to };
  const compare = lifetime
    ? { startDate: `${RECENT_DAYS - 1}daysAgo`, endDate: 'today' }
    : { startDate: prevFrom, endDate: prevTo };
  const seriesReq = lifetime
    ? { // one row per calendar month since the property started
        dateRanges: [cur],
        dimensions: [dim('yearMonth')],
        metrics: ['totalUsers', 'sessions', 'screenPageViews'].map(met),
        dimensionFilter: filter,
        orderBys: [{ dimension: { dimensionName: 'yearMonth' } }],
        limit: 1000
      }
    : { // one daily series covering both periods; the client splits it
        dateRanges: [{ startDate: prevFrom, endDate: to }],
        dimensions: [dim('date')],
        metrics: ['totalUsers', 'sessions', 'screenPageViews'].map(met),
        dimensionFilter: filter,
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 2000
      };

  const reports = await runReports(propertyId, [
    { // headline totals for both ranges (users are de-duplicated per range)
      dateRanges: [cur, compare],
      metrics: ['totalUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'engagementRate', 'averageSessionDuration', 'userEngagementDuration'].map(met),
      dimensionFilter: filter
    },
    seriesReq,
    { // every blog path in the period, folded into per-slug and per-edition totals
      dateRanges: [cur],
      dimensions: [dim('pagePath')],
      metrics: ['screenPageViews', 'userEngagementDuration'].map(met),
      dimensionFilter: filter,
      orderBys: byMetricDesc('screenPageViews'),
      limit: lifetime ? 25000 : 10000
    },
    {
      dateRanges: [cur],
      dimensions: [dim('sessionDefaultChannelGroup')],
      metrics: ['sessions', 'totalUsers', 'engagedSessions', 'screenPageViews'].map(met),
      dimensionFilter: filter,
      orderBys: byMetricDesc('sessions')
    },
    {
      dateRanges: [cur],
      dimensions: [dim('country')],
      metrics: ['totalUsers', 'sessions', 'screenPageViews'].map(met),
      dimensionFilter: filter,
      orderBys: byMetricDesc('totalUsers'),
      limit: 12
    },
    {
      dateRanges: [cur],
      dimensions: [dim('deviceCategory')],
      metrics: ['totalUsers', 'sessions', 'screenPageViews'].map(met),
      dimensionFilter: filter,
      orderBys: byMetricDesc('totalUsers')
    }
  ]);

  const [totalsRep, seriesRep, pagesRep, channelsRep, countriesRep, devicesRep] = reports.map(rowsOf);

  const totalsByRange = Object.fromEntries(totalsRep.map(r => [r.dateRange, r]));
  const totals = {
    current: pickTotals(totalsByRange.date_range_0),
    previous: lifetime ? pickTotals() : pickTotals(totalsByRange.date_range_1),
    recent: lifetime ? pickTotals(totalsByRange.date_range_1) : pickTotals()
  };

  const daily = lifetime ? [] : seriesRep
    .filter(r => /^\d{8}$/.test(r.date))
    .map(r => ({ day: gaDay(r.date), users: r.totalUsers, sessions: r.sessions, pageViews: r.screenPageViews }));
  const monthly = !lifetime ? [] : seriesRep
    .filter(r => /^\d{6}$/.test(r.yearMonth))
    .map(r => ({ month: gaMonth(r.yearMonth), users: r.totalUsers, sessions: r.sessions, pageViews: r.screenPageViews }));

  // One row per slug with its views split by edition. Users are not summed
  // across paths (the same person can read several editions), so only page
  // views and engagement time travel per slug.
  const editions = {};
  const slugAgg = new Map();
  let pathCount = 0;
  for (const r of pagesRep) {
    if (!r.pagePath.startsWith(BLOG_PREFIX)) continue; // GA's "(other)" bucket
    pathCount += 1;
    const { lang: edition, slug } = classifyBlogPath(r.pagePath);
    editions[edition] = (editions[edition] || 0) + r.screenPageViews;
    const a = slugAgg.get(slug) || { slug, views: 0, engagementSec: 0, byLang: {} };
    a.views += r.screenPageViews;
    a.engagementSec += r.userEngagementDuration;
    a.byLang[edition] = (a.byLang[edition] || 0) + r.screenPageViews;
    slugAgg.set(slug, a);
  }
  const bySlug = [...slugAgg.values()]
    .filter(a => !a.slug.includes('/'))
    .sort((a, b) => b.views - a.views)
    .slice(0, MAX_SLUGS);

  const named = (rows, key) => rows.map(r => ({ name: r[key], users: r.totalUsers, sessions: r.sessions, pageViews: r.screenPageViews, engagedSessions: r.engagedSessions || 0 }));

  return {
    propertyId: String(propertyId),
    range: { mode, from, to, prevFrom, prevTo, lang, category },
    totals,
    daily,
    monthly,
    bySlug,
    pathCount,
    editions,
    channels: named(channelsRep, 'sessionDefaultChannelGroup'),
    countries: named(countriesRep, 'country'),
    devices: named(devicesRep, 'deviceCategory'),
    fetchedAt: new Date().toISOString()
  };
}

/* ---------- cache (per server instance) ---------- */

const cache = new Map();
const inflight = new Map();

export function getPropertyId() {
  const raw = (process.env.GA4_PROPERTY_ID || '').replace(/^properties\//, '').trim();
  return /^\d+$/.test(raw) ? raw : '';
}

export async function getBlogAnalytics(params) {
  const propertyId = getPropertyId();
  if (!propertyId) throw new GaConfigError('GA4_PROPERTY_ID is not set (the numeric id of the "Prana Air - GA4" property).');
  if (params.slugs && params.slugs.length === 0) return { ...emptyBlogAnalytics({ propertyId, ...params }), cached: false };
  const key = [propertyId, params.mode || 'window', params.from, params.to, params.prevFrom, params.prevTo, params.lang || 'all', params.category || ''].join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.data, cached: true };
  if (inflight.has(key)) return inflight.get(key);

  const p = fetchBlogAnalytics({ propertyId, ...params })
    .then(data => {
      cache.set(key, { at: Date.now(), data });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return { ...data, cached: false };
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

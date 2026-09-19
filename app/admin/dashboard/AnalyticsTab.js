'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { ALL_LANGUAGES, LANGUAGE_ROWS, decodeEntities, PostThumb, Icon } from './shared';

// One dashboard, two sources:
//  - Google Analytics 4 (via /api/admin/analytics/ga4) is the only source
//    for views, users, sessions and engagement. The route scopes every
//    report to /blog/ paths and applies the toolbar's language and category
//    as path filters, and returns per-slug totals so posts and categories
//    can be given GA numbers by joining on slug.
//  - The CMS contributes what Google cannot know: banner clicks (its own
//    tracker), post metadata, SEO/readability scores, translations and
//    publishing dates.

// Chart ink. Lines and bars use the darker brand green (3.5:1 on the white
// card) so marks clear contrast; the lighter brand green is only a wash.
const INK = {
  series: '#5e9e48',
  wash: '#74b75c',
  compare: '#c3c2b7',
  grid: '#eef0f3',
  axis: '#9ca3af',
  tick: '#6b7280'
};

const RANGES = [
  { key: '7d', label: '7D', title: 'Last 7 days' },
  { key: '30d', label: '30D', title: 'Last 30 days' },
  { key: '90d', label: '90D', title: 'Last 90 days' },
  { key: 'month', label: 'This month', title: 'Month to date' },
  { key: 'all', label: 'All time', title: 'Everything Google Analytics has for the blog' },
  { key: 'custom', label: 'Custom', title: 'Pick a date range' }
];

// Language select. 'en' is the untranslated base post, served at /blog/<slug>/;
// every other edition lives under /blog/<code>/. Banner clicks are NOT tagged
// with a language, so click figures are hidden while a language is selected.
const EN_GLOBAL = { code: 'en', short: 'EN', label: 'English · Global' };
const LANGUAGE_GROUPS = [
  { title: 'English editions', langs: [EN_GLOBAL, ...LANGUAGE_ROWS[0]] },
  { title: 'Translations', langs: LANGUAGE_ROWS[1] }
];
const LANG_LABEL = Object.fromEntries(LANGUAGE_GROUPS.flatMap(g => g.langs).map(l => [l.code, l.label]));
const LANG_SHORT = Object.fromEntries(LANGUAGE_GROUPS.flatMap(g => g.langs).map(l => [l.code, l.short]));

const TREND_METRICS = [
  { key: 'pageViews', label: 'Views', word: 'page views' },
  { key: 'users', label: 'Users', word: 'users' },
  { key: 'sessions', label: 'Sessions', word: 'sessions' }
];
const PREV_KEY = { pageViews: 'prevPageViews', users: 'prevUsers', sessions: 'prevSessions', clicks: 'prevClicks' };
const METRIC_WORD = { ...Object.fromEntries(TREND_METRICS.map(m => [m.key, m.word])), clicks: 'banner clicks' };
const METRIC_LABEL = Object.fromEntries(TREND_METRICS.map(m => [m.key, m.label]));
const PLACEMENT_LABEL = { sidebar: 'Sidebar', post_top: 'Top of post', post_bottom: 'Bottom of post' };

// A post carries its own banner when any of its promotion fields is filled in.
function hasPostBanner(post) {
  const p = post.promotion;
  return !!(p && (p.isActive || p.imageUrl || p.link || p.text));
}

const MS_DAY = 86400000;
const STALE_DAYS = 180;
const NEW_POST_GRACE_DAYS = 30;
const ZERO_TOTALS = { users: 0, newUsers: 0, sessions: 0, pageViews: 0, engagedSessions: 0, engagementRate: 0, avgSessionDuration: 0, engagementDuration: 0 };

/* ---------- date helpers (all in the viewer's local calendar) ---------- */

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / MS_DAY) + 1; }
function dayKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDay(d, withYear) {
  return d.toLocaleDateString('en-US', withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });
}
function fmtSpan(a, b) {
  const sameYear = a.getFullYear() === b.getFullYear();
  return `${fmtDay(a, !sameYear)} – ${fmtDay(b, true)}`;
}
// "2026-09" -> { label: "Sep 26", full: "September 2026" }
function monthLabels(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  };
}

// The reporting window plus the equal-length period before it. "All time"
// is served by GA as a lifetime query; its `start`/`end` (the last 30 days)
// only scope the CMS's daily banner-click rows.
function resolveWindow(range, customStart, customEnd) {
  const today = startOfDay(new Date());
  let start;
  let end = today;
  switch (range) {
    case '7d': start = addDays(today, -6); break;
    case '30d': start = addDays(today, -29); break;
    case '90d': start = addDays(today, -89); break;
    case 'month': start = new Date(today.getFullYear(), today.getMonth(), 1); break;
    case 'custom': {
      start = parseKey(customStart);
      end = parseKey(customEnd);
      if (!start || !end) return null;
      if (end > today) end = today;
      if (start > end) return null;
      break;
    }
    default: start = addDays(today, -29);
  }
  const days = daysBetween(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { range, start, end, days, prevStart, prevEnd, today, lifetime: range === 'all' };
}

/* ---------- number helpers ---------- */

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
function fmtNum(n) {
  const v = Number(n) || 0;
  return v >= 10000 ? compactFmt.format(v) : v.toLocaleString('en-US');
}
function fmtPct(ratio, digits = 1) {
  return `${((Number(ratio) || 0) * 100).toFixed(digits)}%`;
}
function ctrOf(clicks, views) { return views > 0 ? clicks / views : 0; }
function fmtAge(days) {
  if (days < 90) return `${days}d ago`;
  if (days < 730) return `${Math.round(days / 30.4)}mo ago`;
  return `${(days / 365.25).toFixed(1)}y ago`;
}
function fmtDuration(seconds) {
  const s = Math.round(Number(seconds) || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
function fmtTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Delta chip model: direction + text + hover title.
function deltaVs(current, previous, { unit = '', pct = true, periodLabel }) {
  if (!previous && !current) return { dir: 'flat', text: 'No change', title: `No data in either period` };
  if (!previous) return { dir: 'up', text: 'New', title: `Nothing recorded in the ${periodLabel}` };
  const diff = current - previous;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const pctValue = (diff / previous) * 100;
  const text = pct
    ? `${diff > 0 ? '+' : ''}${Number.isInteger(pctValue) ? pctValue : pctValue.toFixed(1)}%`
    : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}${unit}`;
  return { dir, text, title: `${fmtNum(previous)}${unit} in the ${periodLabel}` };
}
// "All time" tiles: lifetime value, chip says what the last 30 days added.
function recentChip(n, word) {
  return { dir: n > 0 ? 'up' : 'flat', text: `+${fmtNum(n)} last 30 days`, title: `${word} in the last 30 days` };
}

/* ---------- small presentational pieces ---------- */

function Sparkline({ values, color = INK.series }) {
  const w = 100, h = 32, pad = 3;
  const n = values.length;
  if (n < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [
    pad + (i / (n - 1)) * (w - pad * 2),
    h - pad - (v / max) * (h - pad * 2)
  ]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[n - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`;
  const [lx, ly] = pts[n - 1];
  return (
    <svg className="an-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.4" fill={color} stroke="#fff" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaChip({ delta }) {
  if (!delta) return null;
  const icon = delta.dir === 'up' ? 'trendUp' : delta.dir === 'down' ? 'trendDown' : 'minus';
  return (
    <span className={`an-delta ${delta.dir}`} title={delta.title}>
      <Icon name={icon} size={13} /> {delta.text}
    </span>
  );
}

function KpiTile({ icon, label, value, delta, note, spark, highlight }) {
  return (
    <div className={`an-kpi${highlight ? ' highlight' : ''}`}>
      <div className="an-kpi-top">
        <span className="an-kpi-icon"><Icon name={icon} size={20} /></span>
        <span className="an-kpi-label">{label}</span>
      </div>
      <div className="an-kpi-value">{value}</div>
      <div className="an-kpi-foot">
        <DeltaChip delta={delta} />
        {note && <span className="an-kpi-note">{note}</span>}
      </div>
      {spark && <div className="an-kpi-spark"><Sparkline values={spark} /></div>}
    </div>
  );
}

function MiniStat({ icon, label, value, sub }) {
  return (
    <div className="an-mini">
      <span className="an-mini-icon"><Icon name={icon} size={18} /></span>
      <div className="an-mini-body">
        <div className="an-mini-label">{label}</div>
        <div className="an-mini-value">{value}</div>
        {sub && <div className="an-mini-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`an-card ${className}`}>
      <header className="an-card-head">
        <div>
          <h3 className="an-card-title">{title}</h3>
          {subtitle && <p className="an-card-sub">{subtitle}</p>}
        </div>
        {action && <div className="an-card-action">{action}</div>}
      </header>
      <div className="an-card-body">{children}</div>
    </section>
  );
}

function Empty({ icon = 'bars', text }) {
  return (
    <div className="an-empty">
      <Icon name={icon} size={22} />
      <span>{text}</span>
    </div>
  );
}

// Ranked horizontal bars with the values printed beside them — for many or
// long-named categories this reads better than a donut, and every value is
// visible without hovering. With `limit`, only the top rows show until the
// reader asks for the rest.
function BarList({ rows, max, columns, nameKey = 'name', barKey = 'views', isActive, wideNames, limit }) {
  const [expanded, setExpanded] = useState(false);
  const top = Math.max(max || 0, 1);
  const collapsible = !!limit && rows.length > limit + 1; // never hide a single row behind a button
  const shown = collapsible && !expanded ? rows.slice(0, limit) : rows;
  return (
    <div className={`an-barlist${wideNames ? ' wide-names' : ''}`} style={{ '--cols': columns.length }}>
      <div className="an-barlist-head">
        <span>Name</span>
        <span />
        {columns.map(c => <span key={c.key} title={c.title}>{c.label}</span>)}
      </div>
      {shown.map(r => (
        <div className={`an-bar-row${isActive?.(r) ? ' active' : ''}`} key={r[nameKey]}>
          <span className="an-bar-name" title={r.title || r[nameKey]}>{r[nameKey]}</span>
          <span className="an-bar-track" aria-hidden="true">
            <span className="an-bar-fill" style={{ width: `${Math.max((r[barKey] / top) * 100, r[barKey] > 0 ? 1.5 : 0)}%` }} />
          </span>
          {columns.map(c => (
            <span key={c.key} className={`an-bar-num${c.muted ? ' muted' : ''}`}>{c.render ? c.render(r) : r[c.key]}</span>
          ))}
        </div>
      ))}
      {collapsible && (
        <button type="button" className="an-more" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
          {expanded ? 'Show less' : `Show all ${rows.length}`} <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
        </button>
      )}
    </div>
  );
}

// Stacked proportion bar with a 2px surface gap between segments; each
// segment also carries an icon + label row so colour never works alone.
function Distribution({ segments, total }) {
  const sum = Math.max(total, 1);
  return (
    <div className="an-dist">
      <div className="an-dist-bar" aria-hidden="true">
        {segments.filter(s => s.value > 0).map(s => (
          <span key={s.key} className={`an-dist-seg ${s.key}`} style={{ flexGrow: s.value }} title={`${s.label}: ${s.value}`} />
        ))}
        {total === 0 && <span className="an-dist-seg none" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="an-dist-legend">
        {segments.map(s => (
          <li key={s.key}>
            <span className={`an-dist-swatch ${s.key}`} aria-hidden="true" />
            <span className="an-dist-label">{s.label}</span>
            <span className="an-dist-num">{s.value}</span>
            <span className="an-dist-pct">{fmtPct(s.value / sum, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendTooltip({ active, payload, metric, compare }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="an-tip">
      <div className="an-tip-title">{p.full || p.label}</div>
      <div className="an-tip-row"><span className="an-dot" style={{ background: INK.series }} />{fmtNum(p[metric])} {METRIC_WORD[metric]}</div>
      {compare && (
        <div className="an-tip-row muted"><span className="an-dot" style={{ background: INK.compare }} />{fmtNum(p[PREV_KEY[metric]])} on {p.prevLabel}</div>
      )}
    </div>
  );
}

function CadenceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="an-tip">
      <div className="an-tip-title">{p.full}</div>
      <div className="an-tip-row"><span className="an-dot" style={{ background: INK.series }} />{p.posts} {p.posts === 1 ? 'post' : 'posts'} published</div>
    </div>
  );
}

function SeoBadge({ score }) {
  if (typeof score !== 'number') return <span className="an-seo none">—</span>;
  const tone = score >= 80 ? 'good' : score >= 50 ? 'mid' : 'poor';
  return <span className={`an-seo ${tone}`} title={`SEO score ${score}/100`}>{score}</span>;
}

// "EN 120 · HI 80 · US 40" — the editions a post was read in, biggest first.
function editionSummary(byLang, limit = 3) {
  const entries = Object.entries(byLang || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, limit).map(([code, n]) => `${LANG_SHORT[code] || code.toUpperCase()} ${fmtNum(n)}`);
  if (entries.length > limit) shown.push(`+${entries.length - limit} more`);
  return shown.join(' · ');
}

/* ---------- the tab ---------- */

export default function AnalyticsTab({ posts, categories = [], bannerSettings = [] }) {
  const [range, setRange] = useState('all');
  const [category, setCategory] = useState('all');
  const [langFilter, setLangFilter] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [trendMetric, setTrendMetric] = useState('pageViews');
  const [daily, setDaily] = useState([]); // CMS tracker rows (banner clicks), window + previous period
  const [monthlyCms, setMonthlyCms] = useState(null); // per-post, per-month rows for "All time"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ga, setGa] = useState(null); // last successful GA4 payload
  const [gaState, setGaState] = useState({ loading: false, error: '', configured: true, reason: '' });
  // Dates are resolved in the viewer's timezone, so the whole body waits for
  // mount to avoid a server/client hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);


  const win = useMemo(() => (mounted ? resolveWindow(range, customStart, customEnd) : null), [mounted, range, customStart, customEnd]);

  // The filter bar sticks just below the site header while the page scrolls.
  // The header is sticky too and its height depends on viewport/wrapping, so
  // it is measured live; a sentinel above the bar tells us when it is stuck
  // so a shadow can separate it from the content sliding underneath.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!mounted) return;
    const header = document.querySelector('.main-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const measure = () => setHeaderHeight(Math.round(header.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  }, [mounted]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: `-${headerHeight + 1}px 0px 0px 0px`, threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [headerHeight, mounted, win]);
  const fetchFrom = win ? dayKey(win.prevStart) : '';
  const fetchTo = win ? dayKey(win.end) : '';
  const winFrom = win ? dayKey(win.start) : '';
  const prevTo = win ? dayKey(win.prevEnd) : '';

  // CMS tracker rows (banner clicks): one request covers the window and the
  // period before it; the split happens client-side.
  useEffect(() => {
    if (!fetchFrom || !fetchTo) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/cms/api/admin/analytics?from=${fetchFrom}&to=${fetchTo}`)
      .then(res => res.json())
      .then(result => {
        if (cancelled) return;
        if (result.success) setDaily(result.data || []);
        else setError(result.error || 'Could not load banner clicks');
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to fetch analytics', err);
        setError('Could not load banner clicks');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchFrom, fetchTo]);

  // "All time" draws banner clicks by month over the whole tracker history.
  useEffect(() => {
    if (!win || range !== 'all' || monthlyCms) return;
    let cancelled = false;
    fetch('/cms/api/admin/analytics?group=month')
      .then(res => res.json())
      .then(result => { if (!cancelled && result.success) setMonthlyCms(result.data || []); })
      .catch(err => console.error('Failed to fetch monthly analytics', err));
    return () => { cancelled = true; };
  }, [win, range, monthlyCms]);

  // GA4 for the same window (plus the period before it, for deltas), or the
  // property's whole history for "All time" (monthly trend, last-30-day
  // notes). Language and category are applied by the server as path filters.
  // Previous data stays on screen (dimmed) while a new range loads.
  useEffect(() => {
    if (!winFrom || !fetchTo) return;
    let cancelled = false;
    setGaState(s => ({ ...s, loading: true, error: '' }));
    const qs = (range === 'all' ? 'mode=lifetime' : `from=${winFrom}&to=${fetchTo}&prevFrom=${fetchFrom}&prevTo=${prevTo}`)
      + `&lang=${encodeURIComponent(langFilter)}`
      + (category !== 'all' ? `&category=${encodeURIComponent(category)}` : '');
    fetch(`/cms/api/admin/analytics/ga4?${qs}`)
      .then(res => res.json())
      .then(result => {
        if (cancelled) return;
        if (result.success && result.configured) {
          setGa(result.data);
          setGaState({ loading: false, error: '', configured: true, reason: '' });
        } else if (result.success) {
          setGa(null);
          setGaState({ loading: false, error: '', configured: false, reason: result.reason || '' });
        } else {
          setGaState(s => ({ ...s, loading: false, error: result.error || 'Could not load Google Analytics' }));
        }
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to fetch GA4 analytics', err);
        setGaState(s => ({ ...s, loading: false, error: 'Could not load Google Analytics' }));
      });
    return () => { cancelled = true; };
  }, [range, winFrom, fetchTo, fetchFrom, prevTo, langFilter, category]);

  const data = useMemo(() => {
    if (!win) return null;
    const lifetime = win.lifetime;
    const langScoped = langFilter !== 'all';
    const inCat = (post) => category === 'all' || (post.categories || []).includes(category);
    // Whether a post exists in the selected language (every post has the base 'en').
    const hasLang = (post) => !langScoped || langFilter === 'en' || (post.translationLangs || []).includes(langFilter);
    const postsById = new Map(posts.map(p => [p._id, p]));
    const startKey = dayKey(win.start), endKey = dayKey(win.end);
    const prevStartKey = dayKey(win.prevStart), prevEndKey = dayKey(win.prevEnd);

    /* ---- CMS: banner clicks (no per-language counter) ---- */
    const clicksByDay = {};
    const clicksByPost = new Map();
    let clicks = 0, prevClicks = 0, recentClicks = 0;
    for (const row of daily) {
      const post = postsById.get(row.postId);
      if (!post || !inCat(post)) continue;
      const c = row.promotionClicks || 0;
      if (row.day >= startKey && row.day <= endKey) {
        clicksByDay[row.day] = (clicksByDay[row.day] || 0) + c;
        recentClicks += c;
        if (!lifetime) {
          clicks += c;
          clicksByPost.set(post._id, (clicksByPost.get(post._id) || 0) + c);
        }
      } else if (row.day >= prevStartKey && row.day <= prevEndKey) {
        clicksByDay[row.day] = (clicksByDay[row.day] || 0) + c;
        prevClicks += c;
      }
    }
    if (lifetime) {
      for (const post of posts) {
        if (!inCat(post)) continue;
        const c = post.analytics?.promotionClicks || 0;
        clicks += c;
        clicksByPost.set(post._id, c);
      }
    }

    // Banner clicks over time: daily (with the previous period) for a date
    // range, monthly over the whole tracker history for "All time".
    const clickSeries = [];
    if (lifetime) {
      const byMonth = {};
      for (const row of monthlyCms || []) {
        const post = postsById.get(row.postId);
        if (!post || !inCat(post)) continue;
        byMonth[row.month] = (byMonth[row.month] || 0) + (row.promotionClicks || 0);
      }
      const keys = Object.keys(byMonth).sort();
      if (keys.length) {
        const [fy, fm] = keys[0].split('-').map(Number);
        const cursor = new Date(fy, fm - 1, 1);
        const last = new Date(win.today.getFullYear(), win.today.getMonth(), 1);
        while (cursor <= last) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
          const { label, full } = monthLabels(key);
          clickSeries.push({ label, full, clicks: byMonth[key] || 0 });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    } else {
      for (let i = 0; i < win.days; i++) {
        const dd = addDays(win.start, i);
        const pp = addDays(win.prevStart, i);
        clickSeries.push({ label: fmtDay(dd), prevLabel: fmtDay(pp), clicks: clicksByDay[dayKey(dd)] || 0, prevClicks: clicksByDay[dayKey(pp)] || 0 });
      }
    }
    const clickPeak = clickSeries.reduce((best, x) => (x.clicks > (best?.clicks || 0) ? x : best), null);

    /* ---- GA: totals, series, per-slug views ---- */
    const gaReady = !!ga;
    const cur = ga?.totals?.current || ZERO_TOTALS;
    const prev = ga?.totals?.previous || ZERO_TOTALS;
    const recent = ga?.totals?.recent || ZERO_TOTALS;
    const zero = { users: 0, sessions: 0, pageViews: 0 };
    const series = [];
    if (lifetime) {
      for (const m of ga?.monthly || []) {
        const { label, full } = monthLabels(m.month);
        series.push({ label, full, users: m.users, sessions: m.sessions, pageViews: m.pageViews });
      }
    } else {
      const byDay = new Map((ga?.daily || []).map(d => [d.day, d]));
      for (let i = 0; i < win.days; i++) {
        const d = addDays(win.start, i);
        const p = addDays(win.prevStart, i);
        const a = byDay.get(dayKey(d)) || zero;
        const b = byDay.get(dayKey(p)) || zero;
        series.push({
          label: fmtDay(d), prevLabel: fmtDay(p),
          users: a.users, sessions: a.sessions, pageViews: a.pageViews,
          prevUsers: b.users, prevSessions: b.sessions, prevPageViews: b.pageViews
        });
      }
    }
    const peak = series.reduce((best, s) => (s.pageViews > (best?.pageViews || 0) ? s : best), null);
    const firstMonth = lifetime && ga?.monthly?.length ? monthLabels(ga.monthly[0].month).full : '';

    const bySlug = new Map((ga?.bySlug || []).map(r => [r.slug, r]));
    const gaOf = (post) => bySlug.get(post.slug) || null;
    const viewsOf = (post) => gaOf(post)?.views || 0;

    /* ---- posts in scope ---- */
    const scoped = posts.filter(inCat);
    const published = scoped.filter(p => p.status === 'published');
    const drafts = scoped.length - published.length;
    const langPosts = langScoped ? published.filter(hasLang) : published;
    const catPostCount = {};
    for (const p of langPosts) {
      for (const c of p.categories || []) catPostCount[c] = (catPostCount[c] || 0) + 1;
    }
    const translatedCount = {};
    for (const p of published) {
      for (const code of p.translationLangs || []) translatedCount[code] = (translatedCount[code] || 0) + 1;
    }
    const postViewsTotal = scoped.reduce((s, p) => s + viewsOf(p), 0);

    // Views by category (GA views of the posts in each; a post in several
    // categories counts toward each).
    const catViews = {};
    for (const p of scoped) {
      const v = viewsOf(p);
      if (!v) continue;
      for (const c of p.categories || []) catViews[c] = (catViews[c] || 0) + v;
    }
    const categoryRows = Object.entries(catViews)
      .map(([name, views]) => ({
        name, views,
        posts: catPostCount[name] || 0,
        share: postViewsTotal ? views / postViewsTotal : 0,
        perPost: catPostCount[name] ? views / catPostCount[name] : 0
      }))
      .sort((a, b) => b.views - a.views);

    // Views by edition: GA page views per URL folder + how many posts exist there.
    const editions = ga?.editions || {};
    const editionTotal = Object.values(editions).reduce((s, n) => s + n, 0);
    const editionRows = [EN_GLOBAL, ...ALL_LANGUAGES]
      .map(l => ({
        ...l,
        title: l.label,
        views: editions[l.code] || 0,
        share: editionTotal ? (editions[l.code] || 0) / editionTotal : 0,
        posts: l.code === 'en' ? published.length : (translatedCount[l.code] || 0)
      }))
      .filter(r => r.views > 0 || r.posts > 0)
      .sort((a, b) => b.views - a.views || b.posts - a.posts);

    const withShare = (rows, key) => {
      const total = rows.reduce((sum, r) => sum + (r[key] || 0), 0);
      return rows.map(r => ({ ...r, share: total ? r[key] / total : 0 }));
    };
    const channels = withShare(ga?.channels || [], 'sessions').map(r => ({ ...r, engaged: r.sessions ? r.engagedSessions / r.sessions : 0 }));
    const countries = withShare(ga?.countries || [], 'users');
    const devices = withShare(ga?.devices || [], 'users');

    // Top posts: GA views (all editions) + CMS clicks.
    const topPosts = scoped
      .filter(hasLang)
      .map(p => {
        const row = gaOf(p);
        const c = clicksByPost.get(p._id) || 0;
        return {
          post: p, views: row?.views || 0, byLang: row?.byLang || {}, clicks: c,
          avgTime: row?.views ? row.engagementSec / row.views : 0,
          share: postViewsTotal ? (row?.views || 0) / postViewsTotal : 0
        };
      })
      .filter(x => x.views > 0 || (!langScoped && x.clicks > 0))
      .sort((a, b) => b.views - a.views || b.clicks - a.clicks)
      .slice(0, 10);

    // Banner list: global + category banners (BannerSettings) and post-level
    // banners (Post.promotion). Clicks are tracked per post, not per banner,
    // so they are attributed by the banner resolution the reader page uses:
    // a post's own banner first, then category banners, then the global one.
    // Only the CURRENT config exists (no log of what was live on a past day),
    // so lifetime totals attribute to today's live category/global banner,
    // while a date range relaxes the "live" gate so an ended banner still
    // reports under its own name. A post-level banner always owns its post.
    const now = new Date();
    const statusOf = (promotion) => {
      if (!promotion?.isActive) return 'off';
      if (promotion.endDate && new Date(promotion.endDate) < now) return 'ended';
      return 'live';
    };
    const isLive = (promotion) => statusOf(promotion) === 'live';
    const bannerRows = new Map();
    for (const b of bannerSettings) {
      const id = b.type === 'global' ? 'global' : b._id;
      bannerRows.set(id, {
        id, kind: b.type,
        name: b.type === 'global' ? 'Global banner' : (b.name || b.promotion?.text || 'Category banner'),
        scope: b.type === 'global' ? 'All posts' : (b.categories || []).join(', '),
        image: b.promotion?.imageUrl || '', link: b.promotion?.link || '', text: b.promotion?.text || '',
        placement: b.promotion?.placement || 'sidebar',
        status: statusOf(b.promotion), endDate: b.promotion?.endDate || null,
        views: 0, clicks: 0, post: null
      });
    }
    for (const post of scoped) {
      if (!hasPostBanner(post)) continue;
      bannerRows.set(`post:${post._id}`, {
        id: `post:${post._id}`, kind: 'post',
        name: post.promotion.text || 'Post banner',
        scope: decodeEntities(post.title),
        image: post.promotion.imageUrl || '', link: post.promotion.link || '', text: post.promotion.text || '',
        placement: post.promotion.placement || 'sidebar',
        status: statusOf(post.promotion), endDate: post.promotion.endDate || null,
        views: viewsOf(post), clicks: clicksByPost.get(post._id) || 0, post
      });
    }
    const bannerFor = (post, requireLive) => {
      const ok = (promotion) => !requireLive || isLive(promotion);
      if (hasPostBanner(post)) return null; // owned by the post's own banner row
      for (const cat of post.categories || []) {
        const catBanner = bannerSettings.find(b => b.type === 'category' && b.categories?.includes(cat) && ok(b.promotion));
        if (catBanner) return catBanner._id;
      }
      return bannerSettings.some(b => b.type === 'global' && ok(b.promotion)) ? 'global' : null;
    };
    for (const post of scoped) {
      const id = bannerFor(post, lifetime);
      const row = id && bannerRows.get(id);
      if (row) { row.views += viewsOf(post); row.clicks += clicksByPost.get(post._id) || 0; }
    }
    const STATUS_ORDER = { live: 0, ended: 1, off: 2 };
    const banners = [...bannerRows.values()].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.clicks - a.clicks || b.views - a.views);
    const liveBanners = banners.filter(b => b.status === 'live').length;

    // Publishing cadence: posts published per month over the last 12 months.
    const months = [];
    const monthIndex = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(win.today.getFullYear(), win.today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthIndex[key] = months.length;
      months.push({
        key,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
        full: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        posts: 0
      });
    }
    // Posts published inside the selected period (the last 30 days for "All
    // time"), by `publishedAt`, within the category + language scope.
    let publishedInWindow = 0;
    for (const p of published) {
      if (!p.publishedAt) continue;
      const d = new Date(p.publishedAt);
      if (Number.isNaN(d.getTime())) continue;
      const idx = monthIndex[`${d.getFullYear()}-${d.getMonth()}`];
      if (idx !== undefined) months[idx].posts += 1;
      if (d >= win.start && d < addDays(win.end, 1) && hasLang(p)) publishedInWindow += 1;
    }
    const cadenceTotal = months.reduce((s, m) => s + m.posts, 0);

    // Content health. "Unviewed" uses GA views in the selected period
    // (lifetime for "All time"); scores are CMS data.
    const unviewed = gaReady ? published.filter(p => viewsOf(p) === 0).length : null;
    const staleCutoff = addDays(win.today, -STALE_DAYS);
    const stale = published.filter(p => {
      const d = new Date(p.updatedAt || p.publishedAt || 0);
      return d < staleCutoff;
    }).length;
    const scored = published.filter(p => typeof p.seo?.score === 'number');
    const seo = {
      good: scored.filter(p => p.seo.score >= 80).length,
      mid: scored.filter(p => p.seo.score >= 50 && p.seo.score < 80).length,
      poor: scored.filter(p => p.seo.score < 50).length,
      unscored: published.length - scored.length,
      avg: scored.length ? Math.round(scored.reduce((s, p) => s + p.seo.score, 0) / scored.length) : null
    };
    const readable = published.filter(p => typeof p.seo?.readability === 'number');
    const readabilityAvg = readable.length ? Math.round(readable.reduce((s, p) => s + p.seo.readability, 0) / readable.length) : null;
    const langSlots = published.length * ALL_LANGUAGES.length;
    const langFilled = published.reduce((s, p) => s + Math.min((p.translationLangs || []).length, ALL_LANGUAGES.length), 0);
    const translation = {
      coverage: langSlots ? langFilled / langSlots : 0,
      complete: published.filter(p => (p.translationLangs || []).length >= ALL_LANGUAGES.length).length,
      none: published.filter(p => !(p.translationLangs || []).length).length
    };

    // Posts that have had time to earn traffic and still have the least (GA views).
    const graceCutoff = addDays(win.today, -NEW_POST_GRACE_DAYS);
    const attention = gaReady
      ? langPosts
        .filter(p => p.publishedAt && new Date(p.publishedAt) < graceCutoff)
        .map(p => ({ post: p, views: viewsOf(p), age: Math.floor((win.today - new Date(p.publishedAt)) / MS_DAY) }))
        .sort((a, b) => a.views - b.views || b.age - a.age)
        .slice(0, 6)
      : [];

    /* ---- deltas ---- */
    const periodLabel = `previous ${win.days === 1 ? 'day' : `${win.days} days`}`;
    const ctr = ctrOf(clicks, cur.pageViews);
    const prevCtr = ctrOf(prevClicks, prev.pageViews);
    const delta = lifetime
      ? {
        users: recentChip(recent.users, 'Users'),
        sessions: recentChip(recent.sessions, 'Sessions'),
        pageViews: recentChip(recent.pageViews, 'Page views'),
        clicks: recentChip(recentClicks, 'Banner clicks'),
        engagementRate: null,
        ctr: null
      }
      : {
        users: deltaVs(cur.users, prev.users, { periodLabel }),
        sessions: deltaVs(cur.sessions, prev.sessions, { periodLabel }),
        pageViews: deltaVs(cur.pageViews, prev.pageViews, { periodLabel }),
        clicks: deltaVs(clicks, prevClicks, { periodLabel }),
        engagementRate: (cur.sessions || prev.sessions)
          ? { ...deltaVs(cur.engagementRate * 100, prev.engagementRate * 100, { unit: ' pts', pct: false, periodLabel }), title: `${fmtPct(prev.engagementRate)} in the ${periodLabel}` }
          : null,
        ctr: (prev.pageViews || cur.pageViews)
          ? { ...deltaVs(ctr * 100, prevCtr * 100, { unit: ' pts', pct: false, periodLabel }), title: `${fmtPct(prevCtr)} in the ${periodLabel}` }
          : null
      };
    const spark = {
      users: series.map(s => s.users),
      sessions: series.map(s => s.sessions),
      pageViews: series.map(s => s.pageViews),
      clicks: clickSeries.map(s => s.clicks)
    };

    return {
      lifetime, langScoped, gaReady, firstMonth,
      cur, prev, recent, clicks, prevClicks, recentClicks, ctr, delta, spark, series, peak, clickSeries, clickPeak,
      channels, countries, devices, categoryRows, editionRows, postViewsTotal,
      topPosts, banners, liveBanners, months, cadenceTotal, publishedInWindow,
      published: published.length, postsInLang: langPosts.length, drafts,
      unviewed, stale, seo, readabilityAvg, translation, attention
    };
  }, [win, daily, monthlyCms, ga, posts, category, langFilter, bannerSettings]);

  if (!mounted) {
    return (
      <div className="an-root">
        <div className="an-toolbar an-placeholder" aria-hidden="true" />
        <div className="an-kpis an-placeholder" aria-hidden="true" />
      </div>
    );
  }

  const todayKey = dayKey(startOfDay(new Date()));
  const busy = loading || gaState.loading;
  const toolbar = (
    <div className={`an-toolbar${stuck ? ' is-stuck' : ''}`} style={{ '--an-sticky-top': `${headerHeight}px` }}>
      <div className="an-toolbar-main">
        <div className="an-seg" role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button
              key={r.key}
              type="button"
              className={`an-seg-btn${range === r.key ? ' active' : ''}`}
              title={r.title}
              aria-pressed={range === r.key}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="an-dates">
            <input type="date" value={customStart} max={customEnd || todayKey} onChange={e => setCustomStart(e.target.value)} aria-label="Start date" />
            <span aria-hidden="true">→</span>
            <input type="date" value={customEnd} min={customStart || undefined} max={todayKey} onChange={e => setCustomEnd(e.target.value)} aria-label="End date" />
          </div>
        )}
        <label className="an-select">
          <Icon name="tag" size={14} />
          <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Category">
            <option value="all">All categories</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </label>
        <label className="an-select">
          <Icon name="globe" size={14} />
          <select value={langFilter} onChange={e => setLangFilter(e.target.value)} aria-label="Language">
            <option value="all">All languages</option>
            {LANGUAGE_GROUPS.map(g => (
              <optgroup key={g.title} label={g.title}>
                {g.langs.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="an-toolbar-meta">
        {busy && <span className="an-spinner" aria-label="Loading" />}
        {!win
          ? <span>Pick a start and end date to load a custom range</span>
          : win.lifetime
            ? <span>All time{data?.firstMonth ? ` · since ${data.firstMonth}` : ''}</span>
            : <span>{fmtSpan(win.start, win.end)} · vs {fmtSpan(win.prevStart, win.prevEnd)}</span>}
        {ga && (
          <span className="an-source" title={`GA4 property ${ga.propertyId} · /blog/ pages only · results are cached for 10 minutes`}>
            <Icon name="ga" size={13} /> GA4 · updated {fmtTime(ga.fetchedAt)}
          </span>
        )}
      </div>
    </div>
  );

  if (!win || !data) {
    return (
      <div className="an-root">
        <div ref={sentinelRef} className="an-sticky-sentinel" aria-hidden="true" />
        {toolbar}
        <Empty icon="calendar" text="Choose both dates above to see analytics for a custom range." />
      </div>
    );
  }

  const d = data;
  const g = d.gaReady;
  const compare = !d.lifetime;
  const clicksKnown = !d.langScoped;
  const langName = d.langScoped ? LANG_LABEL[langFilter] : '';
  const metric = METRIC_LABEL[trendMetric] ? trendMetric : 'pageViews';
  const clicksSpark = d.spark.clicks.length >= 2 ? d.spark.clicks : null;
  const periodText = d.lifetime ? 'all time' : fmtSpan(win.start, win.end);
  const gaValue = (v) => (g ? v : '—');
  const gaWait = gaState.configured ? 'Waiting for Google Analytics…' : 'Connect Google Analytics to see this.';
  const avgPerPost = d.postsInLang ? d.postViewsTotal / d.postsInLang : 0;
  const scopeLabel = `${category === 'all' ? 'All published posts' : `Published posts in ${category}`}${langName ? ` · ${langName}` : ''}`;

  return (
    <div className={`an-root${busy ? ' is-loading' : ''}`}>
      <div ref={sentinelRef} className="an-sticky-sentinel" aria-hidden="true" />
      {toolbar}

      {error && <div className="an-error"><Icon name="alert" size={14} /> {error}</div>}
      {gaState.error && <div className="an-error"><Icon name="alert" size={14} /> {gaState.error}</div>}
      {!gaState.configured && (
        <div className="an-setup">
          <Icon name="alert" size={18} />
          <div>
            <strong>Google Analytics isn't connected, so views and users can't be shown.</strong>
            <p>{gaState.reason}</p>
            <p>Set <code>GA4_PROPERTY_ID</code> plus Google credentials (<code>GA4_CREDENTIALS_JSON</code>, or a local <code>gcloud auth application-default login</code>) in the environment and reload.</p>
          </div>
        </div>
      )}

      {/* Headline numbers */}
      <div className="an-kpis">
        <KpiTile icon="eye" label="Page views" value={gaValue(fmtNum(d.cur.pageViews))} delta={g ? d.delta.pageViews : null} spark={g ? d.spark.pageViews : null} note={g && d.peak?.pageViews ? `peak ${fmtNum(d.peak.pageViews)} on ${d.peak.full || d.peak.label}` : null} />
        <KpiTile icon="users" label="Users" value={gaValue(fmtNum(d.cur.users))} delta={g ? d.delta.users : null} spark={g ? d.spark.users : null} note={g ? `${fmtNum(d.cur.newUsers)} new` : null} />
        <KpiTile
          icon="zap" label="Engagement rate" value={gaValue(fmtPct(d.cur.engagementRate))} delta={g ? d.delta.engagementRate : null}
          note={g ? (d.lifetime ? `${fmtPct(d.recent.engagementRate)} last 30 days · avg session ${fmtDuration(d.cur.avgSessionDuration)}` : `avg session ${fmtDuration(d.cur.avgSessionDuration)}`) : null}
          highlight
        />
        {clicksKnown ? (
          <KpiTile
            icon="click" label="Banner clicks" value={fmtNum(d.clicks)} delta={d.delta.clicks} spark={clicksSpark}
            note={g && d.cur.pageViews ? `CTR ${fmtPct(d.ctr, 2)} of page views` : 'CMS tracker'}
          />
        ) : (
          <KpiTile icon="click" label="Banner clicks" value="—" note="Not tracked per language" />
        )}
      </div>

      <div className="an-minis">
        <MiniStat icon="activity" label="Sessions" value={gaValue(fmtNum(d.cur.sessions))} sub={g ? `${fmtNum(d.cur.engagedSessions)} engaged · ${d.lifetime ? `+${fmtNum(d.recent.sessions)} last 30 days` : (d.delta.sessions?.text || '')}` : gaWait} />
        <MiniStat icon="divide" label="Avg views per post" value={gaValue(avgPerPost.toFixed(1))} sub={g ? `${fmtNum(d.postViewsTotal)} post views ÷ ${d.postsInLang} ${langName ? 'posts in ' + langName : 'published'}` : gaWait} />
        <MiniStat
          icon="star" label={d.lifetime ? 'Best month' : 'Best day'}
          value={g && d.peak?.pageViews ? fmtNum(d.peak.pageViews) : '—'}
          sub={g && d.peak?.pageViews ? `${d.peak.full || d.peak.label} · ${fmtPct(d.peak.pageViews / Math.max(d.cur.pageViews, 1), 0)} of ${d.lifetime ? 'all time' : 'period'}` : (g ? 'No views yet' : gaWait)}
        />
        {d.lifetime ? (
          <MiniStat
            icon="doc" label="Published posts" value={fmtNum(d.postsInLang)}
            sub={`+${d.publishedInWindow} in last 30 days · ${d.drafts} ${d.drafts === 1 ? 'draft' : 'drafts'}${d.langScoped ? ` · in ${langName}` : ''}`}
          />
        ) : (
          <MiniStat
            icon="doc" label="Published this period" value={fmtNum(d.publishedInWindow)}
            sub={`${fmtNum(d.postsInLang)} published in total${d.langScoped ? ` in ${langName}` : ''} · ${d.drafts} ${d.drafts === 1 ? 'draft' : 'drafts'}`}
          />
        )}
      </div>

      {/* Trend + health */}
      <div className="an-grid an-grid-2-1">
        <Card
          title={`${METRIC_LABEL[metric]} over time`}
          subtitle={d.lifetime
            ? `Monthly totals${d.firstMonth ? ` since ${d.firstMonth}` : ''} · Google Analytics, property timezone`
            : `Daily totals, ${fmtSpan(win.start, win.end)} · Google Analytics, property timezone`}
          action={(
            <div className="an-seg small" role="group" aria-label="Metric">
              {TREND_METRICS.map(m => (
                <button key={m.key} type="button" className={`an-seg-btn${metric === m.key ? ' active' : ''}`} aria-pressed={metric === m.key} onClick={() => setTrendMetric(m.key)}>{m.label}</button>
              ))}
            </div>
          )}
        >
          {!g ? <Empty icon="activity" text={gaWait} /> : (
            <>
              {compare && (
                <ul className="an-legend">
                  <li><span className="an-dot" style={{ background: INK.series }} />This period</li>
                  <li><span className="an-dot" style={{ background: INK.compare }} />Previous period</li>
                </ul>
              )}
              <div className="an-chart an-chart-trend">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={d.series} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={INK.wash} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={INK.wash} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={INK.grid} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} minTickGap={28} interval="preserveStartEnd" dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} width={40} allowDecimals={false} tickFormatter={fmtNum} />
                    <Tooltip content={<TrendTooltip metric={metric} compare={compare} />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
                    {compare && (
                      <Line type="monotone" dataKey={PREV_KEY[metric]} stroke={INK.compare} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
                    )}
                    <Area type="monotone" dataKey={metric} stroke={INK.series} strokeWidth={2} fill="url(#anTrendFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: INK.series }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </Card>

        <Card title="Content health" subtitle={`${scopeLabel}${d.langScoped ? ' · scores are for the English text' : ''}`}>
          <div className="an-health">
            <div className="an-health-block">
              <div className="an-health-title">
                <span>SEO score</span>
                <span className="an-health-avg">avg {d.seo.avg ?? '—'}</span>
              </div>
              <Distribution
                total={d.published}
                segments={[
                  { key: 'good', label: 'Good · 80+', value: d.seo.good },
                  { key: 'mid', label: 'Needs work · 50–79', value: d.seo.mid },
                  { key: 'poor', label: 'Poor · under 50', value: d.seo.poor },
                  { key: 'none', label: 'Not scored', value: d.seo.unscored }
                ]}
              />
            </div>
            <ul className="an-health-list">
              <li>
                <span className="an-health-k"><Icon name="eyeOff" size={14} /> {d.lifetime ? 'Never viewed' : 'No views this period'}</span>
                <span className="an-health-v">{d.unviewed ?? '—'} <small>of {d.published}</small></span>
              </li>
              <li>
                <span className="an-health-k"><Icon name="history" size={14} /> Not updated in 6 months</span>
                <span className="an-health-v">{d.stale} <small>{fmtPct(d.stale / Math.max(d.published, 1), 0)}</small></span>
              </li>
              <li>
                <span className="an-health-k"><Icon name="book" size={14} /> Avg readability</span>
                <span className="an-health-v">{d.readabilityAvg ?? '—'} <small>Flesch</small></span>
              </li>
              <li>
                <span className="an-health-k"><Icon name="globe" size={14} /> Translation coverage</span>
                <span className="an-health-v">{fmtPct(d.translation.coverage, 0)} <small>{d.translation.complete} complete · {d.translation.none} English only</small></span>
              </li>
              <li>
                <span className="an-health-k"><Icon name="pen" size={14} /> Drafts waiting</span>
                <span className="an-health-v">{d.drafts}</span>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="an-grid an-grid-2">
        <Card title="Views by category" subtitle={`GA page views of the posts in each category, ${periodText} · posts in several categories count toward each`}>
          {!g ? <Empty icon="tag" text={gaWait} /> : d.categoryRows.length ? (
            <BarList
              rows={d.categoryRows}
              max={d.categoryRows[0].views}
              limit={8}
              wideNames
              columns={[
                { key: 'views', label: 'Views', render: r => fmtNum(r.views) },
                { key: 'share', label: 'Share', muted: true, render: r => fmtPct(r.share, 0) },
                { key: 'perPost', label: 'Per post', muted: true, title: 'Views per published post in the category', render: r => r.posts ? r.perPost.toFixed(1) : '—' }
              ]}
            />
          ) : <Empty icon="tag" text="No post views in this period." />}
        </Card>

        <Card title="Views by edition" subtitle={`GA page views per URL folder (/blog/<lang>/), ${periodText} · and how many posts each edition has`}>
          {!g ? <Empty icon="globe" text={gaWait} /> : d.editionRows.length ? (
            <BarList
              rows={d.editionRows}
              max={d.editionRows[0].views}
              nameKey="label"
              limit={8}
              wideNames
              isActive={d.langScoped ? (r => r.code === langFilter) : null}
              columns={[
                { key: 'views', label: 'Views', render: r => fmtNum(r.views) },
                { key: 'share', label: 'Share', muted: true, render: r => fmtPct(r.share, 0) },
                { key: 'posts', label: 'Posts', muted: true, title: 'Published posts available in this edition', render: r => r.posts }
              ]}
            />
          ) : <Empty icon="globe" text="No page views in this period." />}
        </Card>
      </div>

      <div className="an-grid an-grid-3">
        <Card title="Traffic sources" subtitle={`Sessions by default channel group, ${periodText}`}>
          {!g ? <Empty icon="compass" text={gaWait} /> : d.channels.length ? (
            <BarList
              rows={d.channels}
              max={d.channels[0].sessions}
              barKey="sessions"
              wideNames
              limit={6}
              columns={[
                { key: 'sessions', label: 'Sessions', render: r => fmtNum(r.sessions) },
                { key: 'share', label: 'Share', muted: true, render: r => fmtPct(r.share, 0) },
                { key: 'engaged', label: 'Engaged', muted: true, title: 'Engaged sessions ÷ sessions', render: r => fmtPct(r.engaged, 0) }
              ]}
            />
          ) : <Empty icon="compass" text="No sessions in this period." />}
        </Card>

        <Card title="Countries" subtitle={`Users by country, ${periodText}`}>
          {!g ? <Empty icon="globe" text={gaWait} /> : d.countries.length ? (
            <BarList
              rows={d.countries}
              max={d.countries[0].users}
              barKey="users"
              wideNames
              limit={6}
              columns={[
                { key: 'users', label: 'Users', render: r => fmtNum(r.users) },
                { key: 'share', label: 'Share', muted: true, title: 'Share of the top-12 countries', render: r => fmtPct(r.share, 0) }
              ]}
            />
          ) : <Empty icon="globe" text="No users in this period." />}
        </Card>

        <Card title="Devices" subtitle={`Users by device category, ${periodText}`}>
          {!g ? <Empty icon="monitor" text={gaWait} /> : d.devices.length ? (
            <BarList
              rows={d.devices}
              max={d.devices[0].users}
              barKey="users"
              columns={[
                { key: 'users', label: 'Users', render: r => fmtNum(r.users) },
                { key: 'share', label: 'Share', muted: true, render: r => fmtPct(r.share, 0) }
              ]}
            />
          ) : <Empty icon="monitor" text="No users in this period." />}
        </Card>
      </div>

      {/* Banners */}
      <div className="an-grid an-grid-2">
        <Card
          title="Banner clicks over time"
          subtitle={clicksKnown
            ? (d.lifetime ? `Monthly totals over the tracker's history · CMS tracker` : `Daily totals, ${fmtSpan(win.start, win.end)} · CMS tracker`)
            : 'Clicks aren\'t tracked per language — this chart shows all languages'}
        >
          {d.clickSeries.length ? (
            <>
              {compare && (
                <ul className="an-legend">
                  <li><span className="an-dot" style={{ background: INK.series }} />This period</li>
                  <li><span className="an-dot" style={{ background: INK.compare }} />Previous period</li>
                </ul>
              )}
              <div className="an-chart an-chart-cadence">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={d.clickSeries} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anClickFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={INK.wash} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={INK.wash} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={INK.grid} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} minTickGap={28} interval="preserveStartEnd" dy={6} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} width={32} allowDecimals={false} tickFormatter={fmtNum} />
                    <Tooltip content={<TrendTooltip metric="clicks" compare={compare} />} cursor={{ stroke: INK.axis, strokeWidth: 1 }} />
                    {compare && (
                      <Line type="monotone" dataKey="prevClicks" stroke={INK.compare} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} isAnimationActive={false} />
                    )}
                    <Area type="monotone" dataKey="clicks" stroke={INK.series} strokeWidth={2} fill="url(#anClickFill)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: INK.series }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="an-chart-foot">
                {d.clickPeak?.clicks
                  ? `Peak ${fmtNum(d.clickPeak.clicks)} on ${d.clickPeak.full || d.clickPeak.label} · ${fmtNum(d.clicks)} total`
                  : 'No banner clicks recorded in this period'}
              </div>
            </>
          ) : <Empty icon="click" text={d.lifetime ? 'No banner clicks recorded yet.' : 'No banner clicks recorded in this period.'} />}
        </Card>

        <Card title="Publishing cadence" subtitle={`${d.cadenceTotal} ${d.cadenceTotal === 1 ? 'post' : 'posts'} published in the last 12 months`}>
          {d.cadenceTotal ? (
            <div className="an-chart an-chart-cadence">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.months} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid vertical={false} stroke={INK.grid} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} interval={0} dy={6} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: INK.tick, fontSize: 11 }} width={32} allowDecimals={false} />
                  <Tooltip content={<CadenceTooltip />} cursor={{ fill: 'rgba(17,24,39,0.04)' }} />
                  <Bar dataKey="posts" fill={INK.series} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty icon="calendar" text="Nothing published in the last 12 months." />}
        </Card>
      </div>

      <Card
        title="Banners"
        subtitle={`${d.banners.length} configured · ${d.liveBanners} live · GA views of the posts each banner runs on, CMS-tracked clicks${d.langScoped ? ' (all languages)' : ''}${category !== 'all' ? ` · posts in ${category}` : ''}`}
        action={<a className="an-link" href="/cms/admin/dashboard?tab=banners">Manage banners</a>}
      >
        {d.banners.length ? (
          <div className="an-table-wrap">
            <table className="an-table an-table-banners">
              <thead>
                <tr>
                  <th>Banner</th>
                  <th>Placement</th>
                  <th>Status</th>
                  <th>Ends</th>
                  <th className="num">Views</th>
                  <th className="num">Clicks</th>
                  <th className="num">CTR</th>
                </tr>
              </thead>
              <tbody>
                {d.banners.map(b => {
                  const r = ctrOf(b.clicks, b.views);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="an-post">
                          <PostThumb src={b.image} alt={b.text || b.name} />
                          <div className="an-post-body">
                            <div className="an-cell-title">
                              {b.name}
                              {b.link && <a className="an-ext" href={b.link} target="_blank" rel="noopener noreferrer" title={b.link} aria-label="Open banner link"> <Icon name="external" size={12} /></a>}
                            </div>
                            <div className="an-cell-sub">
                              <span className={`an-chip${b.kind === 'post' ? ' en' : ''}`}>{b.kind === 'post' ? 'Post' : b.kind === 'global' ? 'Global' : 'Category'}</span>
                              {b.post ? <a href={`/admin/editor?id=${b.post._id}`}>{b.scope}</a> : b.scope}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{PLACEMENT_LABEL[b.placement] || b.placement}</td>
                      <td><span className={`an-status ${b.status}`}>{b.status === 'live' ? 'Live' : b.status === 'ended' ? 'Ended' : 'Off'}</span></td>
                      <td>{b.endDate ? fmtDay(new Date(b.endDate), true) : '—'}</td>
                      <td className="num">{gaValue(fmtNum(b.views))}</td>
                      <td className="num">{fmtNum(b.clicks)}</td>
                      <td className={`num${r >= 0.05 ? ' strong' : ''}`}>{g ? fmtPct(r) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="megaphone" text="No banners configured. Add a global or category banner in the Banners tab, or a post banner in the editor." />
        )}
      </Card>

      {/* Post tables */}
      <div className="an-grid an-grid-2-1">
        <Card title="Top performing posts" subtitle={`By GA page views across all editions, ${periodText}${category !== 'all' ? ` · posts in ${category}` : ''}`}>
          {!g ? <Empty icon="news" text={gaWait} /> : d.topPosts.length ? (
            <div className="an-table-wrap">
              <table className="an-table an-table-posts">
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th>Post</th>
                    <th className="num">Views</th>
                    <th className="num" title="Average engagement time per page view">Avg. time</th>
                    <th className="num">Clicks</th>
                    <th className="num">CTR</th>
                    <th className="num">SEO</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topPosts.map(({ post, views, byLang, avgTime, clicks: c, share }, i) => (
                    <tr key={post._id}>
                      <td className="rank">{i + 1}</td>
                      <td>
                        <div className="an-post">
                          <PostThumb src={post.featuredImage} alt={post.featuredImageAlt} />
                          <div className="an-post-body">
                            <a className="an-cell-title" href={`/admin/editor?id=${post._id}`}>{decodeEntities(post.title)}</a>
                            <div className="an-cell-sub">
                              {(post.categories || []).slice(0, 2).join(', ') || 'Uncategorised'}
                              {post.publishedAt ? ` · ${fmtDay(new Date(post.publishedAt), true)}` : ''}
                              {views > 0 ? ` · ${editionSummary(byLang)}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="num">
                        <div>{fmtNum(views)}</div>
                        <div className="an-share" title={`${fmtPct(share)} of post views in this period`}>
                          <span className="an-share-fill" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                        </div>
                      </td>
                      <td className="num">{views > 0 ? fmtDuration(avgTime) : '—'}</td>
                      <td className="num" title={clicksKnown ? undefined : 'Not tracked per language'}>{clicksKnown ? fmtNum(c) : '—'}</td>
                      <td className="num" title={clicksKnown ? undefined : 'Not tracked per language'}>{clicksKnown ? fmtPct(ctrOf(c, views)) : '—'}</td>
                      <td className="num"><SeoBadge score={post.seo?.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon="news" text="No post views recorded in this period." />}
        </Card>

        <Card title="Needs attention" subtitle={`Published ${NEW_POST_GRACE_DAYS}+ days ago with the fewest GA views ${d.lifetime ? 'of all time' : 'in this period'}${langName ? ` in ${langName}` : ''}`}>
          {!g ? <Empty icon="check" text={gaWait} /> : d.attention.length ? (
            <ul className="an-attention">
              {d.attention.map(({ post, views, age }) => (
                <li key={post._id}>
                  <a className="an-attention-title" href={`/admin/editor?id=${post._id}`}>{decodeEntities(post.title)}</a>
                  <div className="an-attention-meta">
                    <span><Icon name="eye" size={14} /> {fmtNum(views)}</span>
                    <span title={`Published ${age} days ago`}><Icon name="calendar" size={14} /> {fmtAge(age)}</span>
                    <SeoBadge score={post.seo?.score} />
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty icon="check" text="Every published post is newer than 30 days." />}
        </Card>
      </div>
    </div>
  );
}

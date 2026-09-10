'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';
import { Editor } from '@tinymce/tinymce-react';
import './editor.css';
import seoAnalysis from '../../../lib/seoAnalysis';

const { analyzeReadabilityAndSeo } = seoAnalysis;

const allLanguages = [
  { code: 'en', label: 'Global English (EN)', short: 'EN', group: 'English Variants' },
  { code: 'in', label: 'English - India (EN-IN)', short: 'IN', group: 'English Variants' },
  { code: 'us', label: 'English - USA (EN-US)', short: 'US', group: 'English Variants' },
  { code: 'en-GB', label: 'English - UK (EN-GB)', short: 'GB', group: 'English Variants' },
  { code: 'en-CA', label: 'English - Canada (EN-CA)', short: 'CA', group: 'English Variants' },
  { code: 'en-AU', label: 'English - Australia (EN-AU)', short: 'AU', group: 'English Variants' },
  { code: 'sg', label: 'English - Singapore (EN-SG)', short: 'SG', group: 'English Variants' },
  { code: 'hi', label: 'Hindi (HI)', short: 'HI', group: 'Translations' },
  { code: 'es', label: 'Spanish (ES)', short: 'ES', group: 'Translations' },
  { code: 'de', label: 'German (DE)', short: 'DE', group: 'Translations' },
  { code: 'fr', label: 'French (FR)', short: 'FR', group: 'Translations' },
  { code: 'ru', label: 'Russian (RU)', short: 'RU', group: 'Translations' },
  { code: 'ja', label: 'Japanese (JA)', short: 'JA', group: 'Translations' },
  { code: 'pt-PT', label: 'Portuguese (PT)', short: 'PT', group: 'Translations' }
];

// Retries a single language's translation request on a 429 (rate limited)
// with exponential backoff before giving up on it. `signal` lets the caller
// cancel an in-flight or not-yet-started request (Cancel button).
async function fetchTranslation({ title, excerpt, content, lang, signal }, attempt = 0) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, excerpt, content, targetLanguage: lang }),
    signal
  });
  const data = await res.json();

  if (res.status === 429 && attempt < 4) {
    const waitMs = 1500 * Math.pow(2, attempt); // 1.5s, 3s, 6s, 12s
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return fetchTranslation({ title, excerpt, content, lang, signal }, attempt + 1);
  }

  if (!data.success) throw new Error(data.error || 'Translation failed');
  return data.translation;
}

// Runs `worker` over `items` with at most `limit` running at once (a new
// one starts as soon as a slot frees up). Translating all 7 languages at
// full concurrency sends more requests per second than the translation
// API's rate limit reliably absorbs; capping it keeps the burst well under
// that limit while still translating far faster than one at a time.
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i]) };
      } catch (err) {
        results[i] = { status: 'rejected', reason: err };
      }
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---- Auto-Fix All --------------------------------------------------------
// Which audit findings (by `code`, see analyzeReadabilityAndSeo) Claude can
// resolve, and through which endpoint action. Everything not listed here
// (word count, featured image, canonical settings) needs a human and is
// reported as such instead of being silently skipped.
const AUTO_FIX_META_CODES = new Set([
  'title_missing', 'title_short', 'title_long',
  'desc_missing', 'desc_short', 'desc_long',
  'slug_missing', 'slug_long',
  'kw_title', 'kw_slug', 'kw_desc',
  'cannibalization'
]);
const AUTO_FIX_CONTENT_DIRECTIVES = {
  kw_body: 'keyword_body',
  kw_stuffing: 'destuff',
  readability: 'readability',
  sentence_length: 'readability',
  jargon: 'readability',
  eeat: 'eeat',
  ymyl: 'ymyl',
  no_h2: 'headings'
};
const AUTO_FIX_META_ROUNDS = 3;

// Progress copy for the single-issue buttons, shown in the progress panel.
const AI_ACTION_LABELS = {
  suggest_keyword: 'Choosing a target keyword…',
  fix_title: 'Rewriting the SEO title…',
  fix_description: 'Writing the meta description…',
  fix_slug: 'Generating the URL slug…',
  differentiate_cannibalization: 'Finding a distinct search angle…',
  optimize_content: 'Weaving the keyword into the article body…',
  fix_content_keyword: 'Weaving the keyword into the article body…',
  fix_readability: 'Simplifying sentences for readability…',
  fix_eeat_ymyl: 'Adding citations and the YMYL disclaimer…',
  fix_metadata: 'Fixing title, slug & description…',
  fix_content: 'Rewriting the article body…',
  fix_all: 'Claude is optimizing…'
};

const AUTO_FIX_INITIAL_STEPS = [
  { key: 'keyword', label: 'Keyword', status: 'pending', detail: '' },
  { key: 'body', label: 'Article body', status: 'pending', detail: '' },
  { key: 'metadata', label: 'Title, slug & description', status: 'pending', detail: '' },
  { key: 'verify', label: 'Re-audit', status: 'pending', detail: '' }
];

// A cannibalization conflict whose every overlapping term is part of the
// primary keyword can't be differentiated without dropping the keyword
// (which the audit would then flag instead). Only a canonical tag or a
// merge resolves that, so it's reported as manual work.
function isConflictOnlyTheKeyword(issue, keyword) {
  const terms = issue?.cannibalization?.overlappingKeywords || [];
  const kw = (keyword || '').toLowerCase();
  return kw.length > 0 && terms.length > 0 && terms.every(t => kw.includes(String(t).toLowerCase()));
}

function isAutoFixable(issue, keyword) {
  if (!issue) return false;
  if (issue.code === 'no_keyword') return true;
  if (AUTO_FIX_CONTENT_DIRECTIVES[issue.code]) return true;
  if (issue.code === 'cannibalization') return !isConflictOnlyTheKeyword(issue, keyword);
  return AUTO_FIX_META_CODES.has(issue.code);
}

const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// "Edited" means saved again after it was published (or, for a draft, after
// it was first created). Mongoose bumps updatedAt on the publish save too,
// so allow a minute of slack before calling that an edit.
const wasEditedAfterPublish = ({ createdAt, publishedAt, updatedAt }) => {
  if (!updatedAt) return false;
  const baseline = new Date(publishedAt || createdAt || 0).getTime();
  return new Date(updatedAt).getTime() - baseline > 60 * 1000;
};

// Competing-post titles come straight from the database and can carry
// WordPress entities ("&amp;"); decode the common ones for display.
const decodeEntitiesForDisplay = (text) => (text || '')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#8217;|&rsquo;/g, '’')
  .replace(/&#8216;|&lsquo;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—');

const listIssueTitles = (issues) => issues.map(i => i.title.replace(/\s*\(.*?\)\s*$/, '')).join(', ');

function BlogEditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const postId = searchParams.get('id'); // Get the post ID if we are editing

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [isSlugLocked, setIsSlugLocked] = useState(true);
  const [showMetaDrawer, setShowMetaDrawer] = useState(false);
  const [serpViewMode, setSerpViewMode] = useState('desktop');
  const [showAuditDrawer, setShowAuditDrawer] = useState(false);
  const [auditTab, setAuditTab] = useState('issues');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [featuredImageAlt, setFeaturedImageAlt] = useState('');
  const [savedFeaturedImageAlt, setSavedFeaturedImageAlt] = useState('');
  const [altSaveState, setAltSaveState] = useState('idle'); // idle | saving | saved
  const [altLookupLoading, setAltLookupLoading] = useState(false);
  const featuredImageAltRef = useRef('');
  useEffect(() => {
    featuredImageAltRef.current = featuredImageAlt;
  }, [featuredImageAlt]);
  const [altHint, setAltHint] = useState(''); // shown under the field after a lookup prefill
  const [status, setStatus] = useState('draft');
  const [author, setAuthor] = useState('Admin');
  // Locked by default so the byline isn't changed by accident; same
  // unlock-to-edit pattern as the URL slug.
  const [isAuthorLocked, setIsAuthorLocked] = useState(true);
  const [postDates, setPostDates] = useState({ createdAt: null, publishedAt: null, updatedAt: null });

  // Tag and Category state
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [existingCategories, setExistingCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');

  // SEO State
  const [primaryKeyword, setPrimaryKeyword] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [canonicalMode, setCanonicalMode] = useState('self');
  const [copiedCanonical, setCopiedCanonical] = useState(false);
  const [existingPosts, setExistingPosts] = useState([]);

  const handleCopyCanonicalTag = (textToCopy) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopiedCanonical(true);
        setTimeout(() => setCopiedCanonical(false), 2200);
      }).catch(err => {
        console.error('Failed to copy canonical tag:', err);
      });
    }
  };

  const altIsDirty = featuredImageAlt.trim() !== savedFeaturedImageAlt.trim();

  const effectiveCanonicalUrl = canonicalMode === 'custom' && canonicalUrl.trim()
    ? canonicalUrl.trim()
    : `https://www.pranaair.com/blog/${slug || 'post-slug'}`;

  const canonicalTagCode = `<link rel="canonical" href="${effectiveCanonicalUrl}" />`;

  // Promotion State
  const [promoImage, setPromoImage] = useState('');
  const [promoText, setPromoText] = useState('');
  const [promoLink, setPromoLink] = useState('');
  const [promoPlacement, setPromoPlacement] = useState('sidebar');
  const [promoEndDate, setPromoEndDate] = useState('');
  const [promoActive, setPromoActive] = useState(false);
  const [aiLoading, setAiLoading] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [aiSteps, setAiSteps] = useState([]);          // Auto-Fix pipeline tracker
  const [aiStepsShown, setAiStepsShown] = useState(false); // keeps the tracker up briefly after finishing
  const aiStepsHideTimer = useRef(null);
  useEffect(() => () => {
    if (aiStepsHideTimer.current) clearTimeout(aiStepsHideTimer.current);
  }, []);

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
    ja: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    'pt-PT': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    in: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    us: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    'en-GB': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    'en-CA': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    'en-AU': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
    sg: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' }
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

  // Unified description & excerpt handler to keep them 100% combined
  const onCombinedDescriptionChange = (val) => {
    setExcerpt(val);
    setSeoDescription(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: {
        ...prev[selectedLang],
        excerpt: val,
        seoDescription: val
      }
    }));
  };

  const onExcerptChange = onCombinedDescriptionChange;
  const onSeoDescriptionChange = onCombinedDescriptionChange;

  const onSeoTitleChange = (val) => {
    setSeoTitle(val);
    setEditorData(prev => ({
      ...prev,
      [selectedLang]: { ...prev[selectedLang], seoTitle: val }
    }));
  };

  // Real-time SEO and Readability Score Calculation with Cannibalization check
  const seoMetrics = useMemo(() => {
    return analyzeReadabilityAndSeo({
      title: seoTitle || title,
      slug,
      description: seoDescription || excerpt,
      content,
      featuredImage,
      featuredImageAlt,
      existingPosts,
      currentPostId: postId,
      canonicalUrl,
      canonicalMode,
      primaryKeyword
    });
  }, [seoTitle, title, slug, seoDescription, excerpt, content, featuredImage, featuredImageAlt, existingPosts, postId, canonicalUrl, canonicalMode, primaryKeyword]);

  // Separate general SEO/readability issues from Keyword Cannibalization issues
  const generalIssues = useMemo(() => seoMetrics.issues.filter(i => !i.isCannibalization), [seoMetrics.issues]);
  const cannibalizationIssue = useMemo(() => seoMetrics.issues.find(i => i.isCannibalization), [seoMetrics.issues]);
  const hasCannibalization = !!cannibalizationIssue;

  const handleLangChange = (newLang) => {
    // 1. Sync current state back to editorData to ensure it is up to date
    const currentLangData = {
      title,
      content,
      excerpt,
      seoTitle,
      seoDescription
    };

    const newEditorData = {
      ...editorData,
      [selectedLang]: currentLangData
    };

    // 2. Load values for new language
    let data = newEditorData[newLang] || { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' };

    // If switching to an English variant and it's empty, pre-fill with Global English
    const englishVariants = ['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg'];
    if (englishVariants.includes(newLang)) {
      const enData = newEditorData.en;
      if (!data.title && !data.content) {
        data = {
          title: enData.title,
          content: enData.content,
          excerpt: enData.excerpt,
          seoTitle: enData.seoTitle,
          seoDescription: enData.seoDescription
        };
        newEditorData[newLang] = data; // Keep the pre-filled data in the state
      }
    }

    setEditorData(newEditorData);

    setTitle(data.title);
    setContent(data.content);
    setExcerpt(data.excerpt);
    setSeoTitle(data.seoTitle);
    setSeoDescription(data.seoDescription);

    setSelectedLang(newLang);
  };

  // UI States
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [authChecked, setAuthChecked] = useState(false);
  const [quillLoaded, setQuillLoaded] = useState(false);

  const editorRef = useRef(null);

  // The site header is sticky; pin the language strip + title row directly
  // beneath it, and TinyMCE's own sticky toolbar directly beneath those.
  // Heights vary with viewport/font, so measure them (the title block is
  // only pinned above 768px — see .editor-sticky-top).
  const getEditorStickyOffset = () => {
    if (typeof document === 'undefined') return 197;
    const header = document.querySelector('.main-header');
    const block = document.querySelector('.editor-sticky-top');
    const headerH = header ? Math.round(header.getBoundingClientRect().height) : 73;
    const blockH = block && window.innerWidth > 768 ? Math.round(block.getBoundingClientRect().height) : 0;
    return headerH + blockH;
  };

  useEffect(() => {
    const apply = () => {
      const header = document.querySelector('.main-header');
      const h = header ? Math.round(header.getBoundingClientRect().height) : 72;
      document.documentElement.style.setProperty('--editor-sticky-top', `${h}px`);
      // TinyMCE reads this option lazily on each docking pass, so a live
      // update keeps the toolbar snug under the title block after resizes.
      try {
        editorRef.current?.options?.set('toolbar_sticky_offset', getEditorStickyOffset());
      } catch { /* editor not ready yet */ }
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  const [showTranslateModal, setShowTranslateModal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateLangs, setTranslateLangs] = useState({
    hi: true, es: true, de: true, fr: true, ru: true, ja: true, 'pt-PT': true
  });
  // Per-language status while a translation run is in flight, drives the
  // progress list in the modal: 'pending' | 'success' | 'error' | 'cancelled'.
  const [translateProgress, setTranslateProgress] = useState({});
  // Set once a run finishes (or is cancelled) so the modal can show a clear
  // summary instead of auto-closing — the writer should see what happened.
  const [translateResult, setTranslateResult] = useState(null);
  const translateAbortRef = useRef(null);
  // Per-language busy state for the delete/re-translate actions in the
  // language-select modal: 'deleting' | 'retranslating' | undefined.
  const [langActionBusy, setLangActionBusy] = useState({});

  const handleTranslateAll = async () => {
    const targetLanguages = Object.keys(translateLangs).filter(l => translateLangs[l]);
    if (targetLanguages.length === 0) {
      showNotification('Please select at least one language.', 'error');
      return;
    }

    const enData = editorData.en;
    const currentTitle = selectedLang === 'en' ? title : enData.title;
    const currentExcerpt = selectedLang === 'en' ? excerpt : enData.excerpt;
    const currentContent = selectedLang === 'en' ? content : enData.content;

    if (!currentTitle) {
      showNotification('Please provide an English title before translating.', 'error');
      return;
    }

    const controller = new AbortController();
    translateAbortRef.current = controller;

    setTranslating(true);
    setTranslateResult(null);
    const initialProgress = {};
    targetLanguages.forEach(l => { initialProgress[l] = 'pending'; });
    setTranslateProgress(initialProgress);

    // Translate each language with its own request instead of asking the
    // model for every selected language in a single generation — batching
    // them all into one call meant the required output (full article x N
    // languages) could blow past the model's max_tokens cap on long/old
    // posts. Per-language requests keep each call bounded by the post's own
    // size, let unrelated languages succeed even if one fails, and (capped
    // to 3 at a time, with 429 retry-with-backoff inside fetchTranslation)
    // stay under the translation API's rate limit even when all 7 languages
    // are selected at once.
    const results = await runWithConcurrency(targetLanguages, 3, async (lang) => {
      const translation = await fetchTranslation({
        title: currentTitle,
        excerpt: currentExcerpt,
        content: currentContent,
        lang,
        signal: controller.signal
      });
      setTranslateProgress(prev => ({ ...prev, [lang]: 'success' }));
      return { lang, translation };
    });

    const wasCancelled = controller.signal.aborted;

    const succeeded = [];
    const failed = [];
    results.forEach((result, i) => {
      const lang = targetLanguages[i];
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else if (result.reason?.name === 'AbortError') {
        setTranslateProgress(prev => ({ ...prev, [lang]: 'cancelled' }));
      } else {
        failed.push(lang);
        setTranslateProgress(prev => ({ ...prev, [lang]: 'error' }));
      }
    });

    if (succeeded.length > 0) {
      setEditorData(prev => {
        const newData = { ...prev };
        succeeded.forEach(({ lang, translation }) => {
          if (newData[lang]) {
            newData[lang] = {
              ...newData[lang],
              title: translation.title || '',
              excerpt: translation.excerpt || '',
              content: translation.content || ''
            };
          }
        });
        return newData;
      });
    }

    setTranslating(false);
    translateAbortRef.current = null;

    if (wasCancelled) {
      setTranslateResult({ type: 'cancelled', succeeded: succeeded.length });
    } else if (failed.length === 0) {
      setTranslateResult({ type: 'success', succeeded: succeeded.length });
      showNotification('Translation completed successfully!', 'success');
    } else if (succeeded.length > 0) {
      setTranslateResult({ type: 'partial', succeeded: succeeded.length, failed });
      showNotification(`Translated ${succeeded.length} language(s), but ${failed.join(', ')} failed.`, 'error');
    } else {
      setTranslateResult({ type: 'failed', failed });
      showNotification('Translation failed for all selected languages.', 'error');
    }
  };

  // Stops any not-yet-finished translation requests in the current run.
  const handleCancelTranslate = () => {
    translateAbortRef.current?.abort();
  };

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

          // Fetch existing posts for keyword cannibalization checks
          fetch('/api/posts?limit=100')
            .then(r => r.json())
            .then(data => {
              if (data.success && Array.isArray(data.data)) {
                setExistingPosts(data.data);
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
            in: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            us: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            'en-GB': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            'en-CA': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            'en-AU': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            sg: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            hi: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            es: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            de: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            fr: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            ru: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            ja: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' },
            'pt-PT': { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' }
          };

          if (post.translations) {
            const postTranslations = post.translations;
            for (const lang of ['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'hi', 'es', 'de', 'fr', 'ru', 'ja', 'pt-PT']) {
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

          // `?lang=` (from the dashboard's language filter) opens straight on
          // that translation; anything unknown falls back to Global English.
          // Empty English variants pre-fill from Global English, exactly as
          // switching tabs by hand does.
          const requestedLang = searchParams.get('lang');
          const initialLang = allLanguages.some(l => l.code === requestedLang) ? requestedLang : 'en';
          let initial = loadedData[initialLang] || loadedData.en;
          if (['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg'].includes(initialLang) && !initial.title && !initial.content) {
            initial = { ...loadedData.en };
            loadedData[initialLang] = initial;
          }

          setEditorData(loadedData);
          setSelectedLang(initialLang);

          setTitle(initial.title);
          setContent(initial.content);
          setExcerpt(initial.excerpt);
          setSeoTitle(initial.seoTitle);
          setSeoDescription(initial.seoDescription);

          setSlug(post.slug || '');
          setFeaturedImage(post.featuredImage || '');
          setFeaturedImageAlt(post.featuredImageAlt || '');
          setSavedFeaturedImageAlt(post.featuredImageAlt || '');
          setAltHint('');
          setStatus(post.status || 'draft');
          setAuthor(post.author || 'Admin');
          setPostDates({
            createdAt: post.createdAt || null,
            publishedAt: post.publishedAt || null,
            updatedAt: post.updatedAt || null
          });
          setCategories(post.categories || []);
          setTags(post.tags || []);

          const loadedKeyword = post.focusKeyword || post.primaryKeyword || post.seo?.focusKeyword || post.seo?.primaryKeyword || '';
          setPrimaryKeyword(loadedKeyword);

          const loadedCanonical = post.seo?.canonicalUrl || '';
          setCanonicalUrl(loadedCanonical);
          if (loadedCanonical && loadedCanonical !== `https://www.pranaair.com/blog/${post.slug}`) {
            setCanonicalMode('custom');
          } else {
            setCanonicalMode('self');
          }

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

  const showNotification = (message, type = 'success', durationMs = 4000) => {
    setNotification({ show: true, message, type });
    setTimeout(() => {
      setNotification({ show: false, message: '', type: '' });
    }, durationMs);
  };

  // Shared POST to the SEO endpoint. `overrides` lets the Auto-Fix pipeline
  // send its in-progress draft instead of React state, which is still stale
  // mid-pipeline because setState hasn't flushed between steps.
  const requestAiFix = async (actionType, overrides = {}) => {
    const res = await fetch('/api/ai/fix-seo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: actionType,
        title: seoTitle || title,
        slug,
        description: seoDescription || excerpt,
        content: content || '',
        language: selectedLang,
        primaryKeyword: primaryKeyword.trim(),
        competingArticle: cannibalizationIssue?.cannibalization?.primaryConflict || null,
        overlappingKeywords: cannibalizationIssue?.cannibalization?.overlappingKeywords || [],
        needsReadabilityFix: seoMetrics.fleschScore < 55,
        ...overrides
      })
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error('Server response was not valid JSON. Please try again.');
    }

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Claude AI optimization failed.');
    }

    return data.data || data;
  };

  // Writes whichever of title/slug/description/content Claude returned into
  // editor state and the per-language store for the active language tab.
  const applyAiResult = (result) => {
    if (result.title) {
      setTitle(result.title);
      setSeoTitle(result.title);
      setEditorData(prev => ({
        ...prev,
        [selectedLang]: {
          ...prev[selectedLang],
          title: result.title,
          seoTitle: result.title
        }
      }));
    }

    if (result.slug) {
      setSlug(result.slug);
      setIsSlugLocked(false);
    }

    if (result.description) {
      setExcerpt(result.description);
      setSeoDescription(result.description);
      setEditorData(prev => ({
        ...prev,
        [selectedLang]: {
          ...prev[selectedLang],
          excerpt: result.description,
          seoDescription: result.description
        }
      }));
    }

    if (result.content) {
      setContent(result.content);
      if (editorRef.current) {
        editorRef.current.setContent(result.content);
      }
      setEditorData(prev => ({
        ...prev,
        [selectedLang]: {
          ...prev[selectedLang],
          content: result.content
        }
      }));
    }
  };

  const handleAiFixSeo = async (actionType, customInstruction = '') => {
    setAiLoading(actionType);
    if (aiStepsHideTimer.current) clearTimeout(aiStepsHideTimer.current);
    setAiSteps([]);
    setAiStepsShown(false);
    try {
      const result = await requestAiFix(actionType, { instruction: customInstruction });

      if (actionType === 'suggest_keyword' && (result.primaryKeyword || result.keyword)) {
        const suggestedKw = (result.primaryKeyword || result.keyword).trim();
        setPrimaryKeyword(suggestedKw);
        showNotification(`Claude suggested target keyword: "${suggestedKw}" (${result.searchIntent || 'High intent'})`, 'success');
        return;
      }

      if (result.primaryKeyword && !primaryKeyword.trim()) {
        setPrimaryKeyword(result.primaryKeyword.trim());
      }

      applyAiResult(result);

      if (actionType === 'differentiate_cannibalization') {
        showNotification(`Claude differentiated topic: ${result.differentiatedAngle || 'New angle applied! Overlap eliminated.'}`, 'success');
      } else if (actionType === 'fix_all') {
        showNotification('Claude optimized SERP metadata and updated main blog body with target keyword!', 'success');
      } else if (actionType === 'optimize_content' || actionType === 'fix_content_keyword') {
        showNotification(`Claude strategically placed "${primaryKeyword}" in the intro, headings & body!`, 'success');
      } else if (actionType === 'fix_eeat_ymyl') {
        showNotification('Claude added WHO/EPA scientific citations, resolved stuffing, and embedded YMYL disclaimer!', 'success');
      } else if (actionType === 'fix_readability') {
        showNotification('Claude simplified long sentences and optimized readability in post body!', 'success');
      } else if (actionType === 'fix_title') {
        showNotification('Claude optimized Title for 45–60 char Google SERP limits!', 'success');
      } else if (actionType === 'fix_description') {
        showNotification('Claude generated 125–155 char high-CTR Meta Description!', 'success');
      } else if (actionType === 'fix_slug') {
        showNotification('Claude generated a clean, keyword-rich URL slug!', 'success');
      }
    } catch (err) {
      console.error('Claude AI Fix Error:', err);
      showNotification(err.message || 'Claude AI optimization request failed.', 'error');
    } finally {
      setAiLoading('');
    }
  };

  // "Auto-Fix All": instead of one giant prompt that returns title, slug,
  // description AND the whole article in a single JSON blob (which truncated
  // on long posts and was never checked against the audit), run a short
  // pipeline and re-run the real audit between steps:
  //   1. pick a target keyword if none is set (everything else hangs off it)
  //   2. rewrite the body once, with only the directives the audit flagged
  //   3. fix title/slug/description, re-audit, and feed any remaining
  //      failures back to Claude for up to AUTO_FIX_META_ROUNDS rounds
  //   4. report exactly what was fixed, what couldn't be, and what's manual
  const setStep = (key, status, detail = '') => {
    setAiSteps(prev => prev.map(step => (step.key === key ? { ...step, status, detail } : step)));
  };

  const handleAutoFixAll = async () => {
    setAiLoading('fix_all');
    setAiProgress('Analyzing audit…');
    if (aiStepsHideTimer.current) clearTimeout(aiStepsHideTimer.current);
    setAiSteps(AUTO_FIX_INITIAL_STEPS.map(step => ({ ...step })));
    setAiStepsShown(true);

    // Working copy: the audit is re-run against this, not React state.
    const draft = {
      title: seoTitle || title,
      slug,
      description: seoDescription || excerpt,
      content: content || '',
      primaryKeyword: primaryKeyword.trim()
    };
    const audit = () => analyzeReadabilityAndSeo({
      ...draft,
      featuredImage,
      featuredImageAlt,
      existingPosts,
      currentPostId: postId,
      canonicalUrl,
      canonicalMode
    });
    const failures = [];

    try {
      let metrics = audit();
      const startIssues = metrics.issues;

      if (!startIssues.some(i => isAutoFixable(i, draft.primaryKeyword))) {
        setAiSteps([]);
        setAiStepsShown(false);
        if (startIssues.length === 0) {
          showNotification('No SEO issues to fix. 🎉', 'success');
        } else {
          showNotification(`Nothing Claude can fix automatically. Needs manual action: ${listIssueTitles(startIssues)}.`, 'error', 8000);
        }
        return;
      }

      // 1. Keyword
      if (!draft.primaryKeyword) {
        setAiProgress('Choosing a target keyword…');
        setStep('keyword', 'active');
        try {
          const r = await requestAiFix('suggest_keyword', { ...draft });
          const kw = (r.primaryKeyword || r.keyword || '').trim();
          if (kw) {
            draft.primaryKeyword = kw;
            setPrimaryKeyword(kw);
            metrics = audit();
          }
          setStep('keyword', kw ? 'done' : 'failed', kw ? `"${kw}"` : 'no suggestion');
        } catch (err) {
          failures.push(`keyword suggestion (${err.message})`);
          setStep('keyword', 'failed');
        }
      } else {
        setStep('keyword', 'skipped', 'already set');
      }

      // 2. Article body, one pass
      const directives = Array.from(new Set(
        metrics.issues.map(i => AUTO_FIX_CONTENT_DIRECTIVES[i.code]).filter(Boolean)
      ));
      if (directives.length > 0) {
        setAiProgress('Rewriting article body…');
        setStep('body', 'active', `${directives.length} fix${directives.length === 1 ? '' : 'es'}`);
        try {
          const r = await requestAiFix('fix_content', { ...draft, directives });
          if (r.content) {
            draft.content = r.content;
            applyAiResult({ content: r.content });
            metrics = audit();
          }
          setStep('body', 'done');
        } catch (err) {
          failures.push(`article body (${err.message})`);
          setStep('body', 'failed');
        }
      } else {
        setStep('body', 'skipped', 'nothing flagged');
      }

      // 3. Metadata, verified against the audit and retried with feedback
      let metaRan = false;
      let metaFailed = false;
      for (let round = 1; round <= AUTO_FIX_META_ROUNDS; round++) {
        const metaIssues = metrics.issues.filter(i =>
          AUTO_FIX_META_CODES.has(i.code) &&
          !(i.code === 'cannibalization' && isConflictOnlyTheKeyword(i, draft.primaryKeyword))
        );
        if (metaIssues.length === 0) break;

        metaRan = true;
        setAiProgress(round === 1
          ? 'Fixing title, slug & description…'
          : `Re-checking metadata (attempt ${round}/${AUTO_FIX_META_ROUNDS})…`);
        setStep('metadata', 'active', `round ${round}/${AUTO_FIX_META_ROUNDS}`);

        const conflict = metaIssues.find(i => i.isCannibalization)?.cannibalization;
        try {
          const r = await requestAiFix('fix_metadata', {
            ...draft,
            competingArticle: conflict?.primaryConflict || null,
            overlappingKeywords: conflict?.overlappingKeywords || [],
            feedback: metaIssues.map(i => `${i.title}: ${i.issue}`)
          });
          if (r.title) draft.title = r.title;
          if (r.slug) draft.slug = r.slug;
          if (r.description) draft.description = r.description;
          applyAiResult(r);
          metrics = audit();
        } catch (err) {
          failures.push(`metadata (${err.message})`);
          metaFailed = true;
          break;
        }
      }
      if (!metaRan) {
        setStep('metadata', 'skipped', 'nothing flagged');
      } else if (metaFailed) {
        setStep('metadata', 'failed');
      } else {
        setStep('metadata', 'done');
      }

      // 4. Report
      setAiProgress('Re-checking the audit…');
      const endCodes = new Set(metrics.issues.map(i => i.code));
      const fixed = startIssues.filter(i => !endCodes.has(i.code));
      const remaining = metrics.issues;
      const stillAuto = remaining.filter(i => isAutoFixable(i, draft.primaryKeyword));
      const manual = remaining.filter(i => !isAutoFixable(i, draft.primaryKeyword));

      setStep('verify', 'done', `${fixed.length}/${startIssues.length} fixed`);

      const parts = [`Auto-Fix resolved ${fixed.length} of ${startIssues.length} issue${startIssues.length === 1 ? '' : 's'}.`];
      if (failures.length) parts.push(`Failed: ${failures.join('; ')}.`);
      if (stillAuto.length) parts.push(`Still flagged after ${AUTO_FIX_META_ROUNDS} tries: ${listIssueTitles(stillAuto)} — use the per-issue buttons to retry.`);
      if (manual.length) {
        const hint = manual.some(i => i.code === 'cannibalization') ? ' (for cannibalization, set a canonical tag to the competing article)' : '';
        parts.push(`Needs manual action: ${listIssueTitles(manual)}${hint}.`);
      }
      showNotification(parts.join(' '), failures.length === 0 && fixed.length > 0 ? 'success' : 'error', 9000);
    } catch (err) {
      console.error('Auto-Fix All error:', err);
      showNotification(err.message || 'Auto-Fix All failed.', 'error');
      setAiSteps(prev => prev.map(step => (step.status === 'active' ? { ...step, status: 'failed' } : step)));
    } finally {
      setAiLoading('');
      setAiProgress('');
      // Leave the finished tracker up for a moment so the ✓/✕ per step is
      // readable alongside the summary toast.
      aiStepsHideTimer.current = setTimeout(() => setAiStepsShown(false), 7000);
    }
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

  // Recovers the image's original alt text from the WordPress media library
  // (see /api/admin/media-alt). Runs automatically (see the effect below);
  // it only prefills an empty field, and the Save button commits the value.
  const fetchOriginalAltText = async (src) => {
    const imageSrc = (src || '').trim();
    if (!imageSrc) return;
    setAltLookupLoading(true);
    try {
      const res = await fetch(`/api/admin/media-alt?src=${encodeURIComponent(imageSrc)}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Lookup failed.');
      }
      // The author may have started typing while this was in flight.
      if (result.alt && !featuredImageAltRef.current.trim()) {
        setFeaturedImageAlt(result.alt);
        setAltHint('Original alt text from the source image — click Save to keep it.');
      }
    } catch (err) {
      console.error('Original alt lookup error:', err);
    } finally {
      setAltLookupLoading(false);
    }
  };

  // Whenever a WordPress-hosted image is set and there's no alt text yet,
  // fetch the original alt from the source automatically. Debounced so
  // typing a URL doesn't fire a lookup per keystroke.
  useEffect(() => {
    if (!featuredImage || featuredImageAltRef.current.trim() || !/wp-content\/uploads\//i.test(featuredImage)) return;
    const timer = setTimeout(() => fetchOriginalAltText(featuredImage), 600);
    return () => clearTimeout(timer);
  }, [featuredImage]);

  // Saves only the featured image + alt text on an existing post. It's a
  // partial update, so status, publishedAt and translations are untouched;
  // the full "Save"/"Publish" buttons still send everything.
  const handleSaveAltText = async () => {
    if (!postId) {
      showNotification('Save the post first; after that the alt text can be saved on its own.', 'error');
      return;
    }
    const nextAlt = featuredImageAlt.trim();
    setAltSaveState('saving');
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featuredImage, featuredImageAlt: nextAlt })
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save alt text.');
      }
      setFeaturedImageAlt(nextAlt);
      setSavedFeaturedImageAlt(nextAlt);
      setAltHint('');
      if (result.data) {
        setPostDates({
          createdAt: result.data.createdAt || null,
          publishedAt: result.data.publishedAt || null,
          updatedAt: result.data.updatedAt || null
        });
      }
      setAltSaveState('saved');
      setTimeout(() => setAltSaveState('idle'), 2000);
      showNotification('Featured image alt text saved.');
    } catch (err) {
      console.error('Alt text save error:', err);
      setAltSaveState('idle');
      showNotification(err.message || 'Failed to save alt text.', 'error');
    }
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

  // Builds the postData payload from a given editorData snapshot and saves
  // it (PUT if editing, POST if new). Shared by handleSave and the
  // delete/re-translate language actions below, so all three write the same
  // shape of translations map instead of drifting apart.
  const persistEditorData = async (nextEditorData, statusOverride = status) => {
    const enData = nextEditorData.en;

    if (!enData.title.trim()) {
      showNotification('Please enter a title for English.', 'error');
      return { success: false };
    }
    if (!slug.trim()) {
      showNotification('Please enter a slug.', 'error');
      return { success: false };
    }

    const payloadTranslations = {};
    for (const lang of ['in', 'us', 'en-GB', 'en-CA', 'en-AU', 'sg', 'hi', 'es', 'de', 'fr', 'ru', 'ja', 'pt-PT']) {
      const t = nextEditorData[lang];
      if (t.title.trim() || t.content.trim()) {
        payloadTranslations[lang] = {
          title: t.title,
          content: t.content,
          excerpt: t.excerpt || t.title,
          seo: {
            title: t.seoTitle || t.title,
            description: t.seoDescription || t.excerpt || t.title,
            keywords: [...categories, ...tags],
            canonicalUrl: canonicalMode === 'custom' ? canonicalUrl.trim() : ''
          }
        };
      }
    }

    // Score the English base post (whatever language tab is open), since
    // that's what the dashboard lists and what search engines index first.
    const enMetrics = analyzeReadabilityAndSeo({
      title: enData.seoTitle || enData.title,
      slug,
      description: enData.seoDescription || enData.excerpt,
      content: enData.content,
      featuredImage,
      featuredImageAlt,
      existingPosts,
      currentPostId: postId,
      canonicalUrl,
      canonicalMode,
      primaryKeyword: primaryKeyword.trim()
    });

    const postData = {
      title: enData.title,
      slug,
      content: enData.content,
      excerpt: enData.excerpt || enData.title,
      featuredImage,
      featuredImageAlt,
      status: statusOverride,
      author,
      categories,
      tags,
      primaryKeyword: primaryKeyword.trim(),
      focusKeyword: primaryKeyword.trim(),
      seo: {
        title: enData.seoTitle || enData.title,
        description: enData.seoDescription || enData.excerpt || enData.title,
        keywords: [...categories, ...tags],
        primaryKeyword: primaryKeyword.trim(),
        focusKeyword: primaryKeyword.trim(),
        canonicalUrl: canonicalMode === 'custom' ? canonicalUrl.trim() : '',
        // Stored so the dashboard can list scores without loading bodies.
        score: enMetrics.seoScore,
        readability: enMetrics.fleschScore,
        grade: enMetrics.gradeLevel,
        scoredAt: new Date().toISOString()
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(postData),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        return {
          success: true,
          id: result.data?._id,
          dates: result.data ? {
            createdAt: result.data.createdAt || null,
            publishedAt: result.data.publishedAt || null,
            updatedAt: result.data.updatedAt || null
          } : null
        };
      }
      showNotification(result.error || 'Failed to save post.', 'error');
      return { success: false };
    } catch (err) {
      console.error(err);
      showNotification('Network error occurred while saving.', 'error');
      return { success: false };
    }
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

    const { success, id, dates } = await persistEditorData(updatedEditorData, postStatus);
    if (success) {
      setStatus(postStatus);
      if (dates) setPostDates(dates);
      setSavedFeaturedImageAlt(featuredImageAlt);
      setAltHint('');
      setEditorData(updatedEditorData);
      showNotification(`Post successfully saved as ${postStatus}!`);

      // If it's a new post, update URL so we get the ID for further saves and Preview button
      if (!postId && id) {
        router.push(`/admin/editor?id=${id}`);
      }
    }
  };

  // Clears a translation's content and saves immediately, so a wrong
  // auto-translate doesn't have to be manually blanked out field by field.
  const handleDeleteTranslation = async (langCode) => {
    if (!postId) {
      showNotification('Save the post before managing translations.', 'error');
      return;
    }
    const label = allLanguages.find(l => l.code === langCode)?.label || langCode;
    if (!window.confirm(`Delete the ${label} translation? This can't be undone.`)) return;

    setLangActionBusy(prev => ({ ...prev, [langCode]: 'deleting' }));
    const nextEditorData = {
      ...editorData,
      [selectedLang]: { title, content, excerpt, seoTitle, seoDescription },
      [langCode]: { title: '', content: '', excerpt: '', seoTitle: '', seoDescription: '' }
    };

    const { success } = await persistEditorData(nextEditorData);
    if (success) {
      setEditorData(nextEditorData);
      if (selectedLang === langCode) {
        handleLangChange('en');
      }
      showNotification(`${label} translation deleted.`, 'success');
    }
    setLangActionBusy(prev => {
      const next = { ...prev };
      delete next[langCode];
      return next;
    });
  };

  // Re-runs auto-translate for a single language (e.g. a bad first attempt)
  // from the current English content, then saves the result immediately.
  const handleRetranslateOne = async (langCode) => {
    if (!postId) {
      showNotification('Save the post before managing translations.', 'error');
      return;
    }
    const label = allLanguages.find(l => l.code === langCode)?.label || langCode;
    const enData = editorData.en;
    const currentTitle = selectedLang === 'en' ? title : enData.title;
    const currentExcerpt = selectedLang === 'en' ? excerpt : enData.excerpt;
    const currentContent = selectedLang === 'en' ? content : enData.content;

    if (!currentTitle.trim()) {
      showNotification('Please provide an English title before translating.', 'error');
      return;
    }

    setLangActionBusy(prev => ({ ...prev, [langCode]: 'retranslating' }));
    try {
      const translation = await fetchTranslation({ title: currentTitle, excerpt: currentExcerpt, content: currentContent, lang: langCode });
      const nextEditorData = {
        ...editorData,
        [selectedLang]: { title, content, excerpt, seoTitle, seoDescription },
        [langCode]: {
          title: translation.title || '',
          excerpt: translation.excerpt || '',
          content: translation.content || '',
          seoTitle: '',
          seoDescription: ''
        }
      };

      const { success } = await persistEditorData(nextEditorData);
      if (success) {
        setEditorData(nextEditorData);
        if (selectedLang === langCode) {
          setTitle(nextEditorData[langCode].title);
          setContent(nextEditorData[langCode].content);
          setExcerpt(nextEditorData[langCode].excerpt);
          setSeoTitle(nextEditorData[langCode].seoTitle);
          setSeoDescription(nextEditorData[langCode].seoDescription);
        }
        showNotification(`${label} translation updated.`, 'success');
      }
    } catch (err) {
      console.error(err);
      showNotification(err.message || `Failed to re-translate ${label}.`, 'error');
    } finally {
      setLangActionBusy(prev => {
        const next = { ...prev };
        delete next[langCode];
        return next;
      });
    }
  };

  // Single source of truth for a language's status, shared by the top
  // status strip and the "Select Language to Edit" modal so they can never
  // disagree with each other.
  const getLangStatus = (lang) => {
    const isEnglishBase = lang.code === 'en';
    const data = isEnglishBase ? { title, content } : editorData[lang.code];
    const hasContent = (data?.title?.trim() || '') !== '';
    const sameAsEnglish = !isEnglishBase && hasContent
      && data.title === editorData.en.title
      && data.content === editorData.en.content;

    if (isEnglishBase) return { key: 'done', text: 'Original', symbol: '●' };
    if (hasContent && sameAsEnglish) return { key: 'same', text: 'Same as English', symbol: '●' };
    if (hasContent) return { key: 'done', text: 'Translated', symbol: '✓' };
    return { key: 'pending', text: 'Not written', symbol: '○' };
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
        <div className={`editor-toast ${notification.type === 'error' ? 'error' : 'success'}`}>
          {notification.message}
        </div>
      )}

      {/* Editor Header Navigation */}
      <div className="editor-header">
        <div className="header-title">
          <a href="/admin/dashboard?tab=posts" className="header-back-link">
            &larr; Back to Dashboard
          </a>
          <h1>{postId ? 'Edit Blog Post' : 'Write a New Post'}</h1>
          <p>{postId ? 'Update post content and SEO configs in MongoDB' : 'Draft and publish blog content directly to your MongoDB database'}</p>
        </div>
        <div className="action-buttons">
          {postId && slug && (
            <a
              href={selectedLang === 'en' ? `/test-blog/${slug}` : `/test-blog/${slug}?lang=${selectedLang}`}
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
          <div className="main-editor-card">
            {/* Language strip + title row stay pinned under the site header while
                the article scrolls (see .editor-sticky-top) */}
            <div className="editor-sticky-top">
              {/* Ultra-compact single-row language strip */}
              <div className="lang-strip">
                <div className="lang-strip-left">
                  <div className="lang-strip-label" title="Languages">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    <span>Lang:</span>
                  </div>

                  <div className="lang-pills-wrap">
                    {allLanguages.map((lang) => {
                      const isActive = selectedLang === lang.code;
                      const isTranslationLang = lang.group === 'Translations';
                      const hasContent = (lang.code === 'en' ? title : editorData[lang.code]?.title)?.trim() !== '';
                      const status = getLangStatus(lang);
                      const busy = langActionBusy[lang.code];
                      const isFirstTranslation = lang.code === 'hi';

                      return (
                        <React.Fragment key={lang.code}>
                          {isFirstTranslation && <span className="lang-pills-separator" />}
                          <div
                            className={`lang-pill ${isActive ? 'active' : ''} ${status.key}`}
                            title={`${lang.label} (${status.text})`}
                          >
                            <button
                              type="button"
                              onClick={() => handleLangChange(lang.code)}
                              className="lang-pill-main"
                            >
                              <span className="lang-pill-name">{lang.short || lang.code.toUpperCase()}</span>
                              <span className={`lang-symbol ${status.key}`}>{status.symbol}</span>
                            </button>

                            {isTranslationLang && hasContent && (
                              <div className="lang-pill-actions">
                                <button
                                  type="button"
                                  className="lang-micro-btn"
                                  title={`Re-translate ${lang.label}`}
                                  disabled={!!busy}
                                  onClick={(e) => { e.stopPropagation(); handleRetranslateOne(lang.code); }}
                                >
                                  {busy === 'retranslating' ? (
                                    <span className="translate-spinner mini" />
                                  ) : (
                                    '↻'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="lang-micro-btn danger"
                                  title={`Delete ${lang.label} translation`}
                                  disabled={!!busy}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTranslation(lang.code); }}
                                >
                                  {busy === 'deleting' ? (
                                    <span className="translate-spinner mini" />
                                  ) : (
                                    '×'
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setTranslateResult(null); setTranslateProgress({}); setShowTranslateModal(true); }}
                  className="btn-translate-compact"
                  title="Auto Translate post to other languages"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                  <span>Auto Translate</span>
                </button>
              </div>

              <div className="editor-title-row">
                <input
                  type="text"
                  className="editor-title-input"
                  placeholder={`Post title (${selectedLang.toUpperCase()})...`}
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                />
                <button
                  type="button"
                  className={`btn-meta-toggle ${showMetaDrawer ? 'open' : ''}`}
                  onClick={() => setShowMetaDrawer(!showMetaDrawer)}
                  title="Toggle URL Slug and Excerpt drawer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  <span className="meta-toggle-slug">/{slug || 'slug'}</span>
                  <span className="meta-toggle-chevron">{showMetaDrawer ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>

            {/* Expandable Meta Drawer for Slug & Excerpt right below title */}
            {showMetaDrawer && (
              <div className="editor-meta-drawer">
                <div className="meta-drawer-grid">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>URL Slug</span>
                      <button
                        type="button"
                        onClick={() => setIsSlugLocked(!isSlugLocked)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                      >
                        {isSlugLocked ? 'Edit Slug' : 'Lock Slug'}
                      </button>
                    </label>
                    <input
                      type="text"
                      className="input-text"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                      value={slug}
                      disabled={isSlugLocked}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="url-friendly-slug"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Meta Description / Excerpt ({selectedLang.toUpperCase()})</label>
                    <input
                      type="text"
                      className="input-text"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                      placeholder={`Summary for search engines & excerpt in ${selectedLang.toUpperCase()}...`}
                      value={seoDescription || excerpt}
                      onChange={(e) => onCombinedDescriptionChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
              <div className="rich-editor-wrapper">
                <Editor
                  tinymceScriptSrc="https://cdnjs.cloudflare.com/ajax/libs/tinymce/7.3.0/tinymce.min.js"
                  onInit={(evt, editor) => {
                    editorRef.current = editor;
                    try { editor.options.set('toolbar_sticky_offset', getEditorStickyOffset()); } catch { /* older API */ }
                  }}
                  value={content}
                  onEditorChange={handleEditorChange}
                  init={{
                    height: 3300,
                    min_height: 3000,
                    resize: true,
                    // Menubar + toolbar dock under the pinned title block while
                    // the (page-scrolling) editor is in view.
                    toolbar_sticky: true,
                    toolbar_sticky_offset: 197,
                    branding: false,
                    promotion: false,
                    menubar: true,
                    image_title: true,
                    image_advtab: true,
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
                    content_style: `
                      body {
                        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 16px;
                        line-height: 1.75;
                        color: #1f2937;
                        padding: 1.5rem 2rem;
                        max-width: 100%;
                        box-sizing: border-box;
                      }
                      p { margin: 0 0 1.25rem 0; }
                      h1, h2, h3, h4, h5, h6 { color: #111827; font-weight: 700; margin-top: 1.75rem; margin-bottom: 0.75rem; }
                      h1 { font-size: 2rem; }
                      h2 { font-size: 1.5rem; }
                      h3 { font-size: 1.25rem; }
                      img { max-width: 100%; height: auto; border-radius: 8px; }
                      blockquote { border-left: 4px solid #74b75c; padding-left: 1rem; margin: 1.5rem 0; font-style: italic; color: #4b5563; }
                      table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
                      th, td { border: 1px solid #e5e7eb; padding: 0.75rem 1rem; text-align: left; }
                      th { background-color: #f9fafb; font-weight: 600; }
                      code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
                      pre { background: #1e293b; color: #f8fafc; padding: 1rem; border-radius: 8px; overflow-x: auto; }
                    `,
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
            <div className="publish-meta-row">
              <span className="form-label">Published:</span>
              <span className={`publish-meta-value ${postDates.publishedAt ? '' : 'muted'}`}>
                {postDates.publishedAt ? formatDateTime(postDates.publishedAt) : 'Not published yet'}
              </span>
            </div>
            {wasEditedAfterPublish(postDates) && (
              <div className="publish-meta-row">
                <span className="form-label">Last modified:</span>
                <span className="publish-meta-value">{formatDateTime(postDates.updatedAt)}</span>
              </div>
            )}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Author Name</span>
                <button
                  type="button"
                  onClick={() => setIsAuthorLocked(!isAuthorLocked)}
                  style={{ background: 'none', border: 'none', color: isAuthorLocked ? '#2563eb' : '#16a34a', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                  title={isAuthorLocked ? 'Unlock to change the author name' : 'Lock the author name'}
                >
                  {isAuthorLocked ? '🔒 Edit Author' : '🔓 Lock Author'}
                </button>
              </label>
              <input
                type="text"
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                value={author}
                disabled={isAuthorLocked}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>
          </div>

          {/* Card 2: Search Engine (SERP) & URL */}
          <div className="sidebar-card">
            <h3 className="sidebar-card-title">Search Engine (SERP) &amp; URL</h3>

            {/* Realistic Desktop / Mobile Switcher */}
            <div className="serp-device-tabs">
              <button
                type="button"
                className={`serp-device-btn ${serpViewMode === 'desktop' ? 'active' : ''}`}
                onClick={() => setSerpViewMode('desktop')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                  <line x1="8" y1="21" x2="16" y2="21"></line>
                  <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                Google Desktop
              </button>
              <button
                type="button"
                className={`serp-device-btn ${serpViewMode === 'mobile' ? 'active' : ''}`}
                onClick={() => setSerpViewMode('mobile')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                  <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
                Google Mobile
              </button>
            </div>

            {/* Google SERP Preview: Desktop or Mobile */}
            {serpViewMode === 'desktop' ? (
              <div className="serp-preview-card">
                <div className="serp-header-row">
                  <div className="serp-source-info">
                    <div className="serp-favicon-wrap">
                      <svg className="serp-favicon-icon" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                        <path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.6 4.6 8.4L12 22l5.4-1.6C20.2 18.6 22 15.5 22 12c0-5.5-4.5-10-10-10z" />
                        <path d="M12 6v12M8 10l4-4 4 4" />
                      </svg>
                    </div>
                    <div className="serp-source-text">
                      <span className="serp-site-name">Prana Air</span>
                      <span className="serp-url-breadcrumb">
                        https://www.pranaair.com › blog › {slug || 'post-slug'}
                      </span>
                    </div>
                  </div>
                  <span className="serp-kebab-menu" title="About this result">⋮</span>
                </div>

                <div className="serp-preview-title">
                  {seoTitle || title || 'Post Title - Prana Air Blog'}
                </div>

                <p className="serp-preview-desc">
                  <span className="serp-date-prefix">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — </span>
                  {seoDescription || excerpt || 'Search engine description preview will appear here. Write a clear summary to help readers discover this article on Google...'}
                </p>

                <div className="serp-sitelinks-row">
                  <span className="serp-sitelink-tag">⚡ Air Quality Guide</span>
                  <span className="serp-sitelink-tag">🔬 Health Impact</span>
                  <span className="serp-sitelink-tag">🌿 Clean Air</span>
                </div>
              </div>
            ) : (
              <div className="serp-mobile-container">
                <div className="serp-mobile-statusbar">
                  <span>9:41</span>
                  <span>5G 📶 100% 🔋</span>
                </div>
                <div className="serp-mobile-searchbar">
                  <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>🔍</span>
                  <span className="serp-mobile-url" title={`google.com/search?q=${encodeURIComponent((seoTitle || title || 'prana air').toLowerCase())}`}>
                    google.com/search?q={encodeURIComponent((seoTitle || title || 'prana air').toLowerCase())}
                  </span>
                </div>

                <div className="serp-preview-card" style={{ padding: '0.75rem 0.85rem' }}>
                  <div className="serp-header-row">
                    <div className="serp-source-info">
                      <div className="serp-favicon-wrap" style={{ width: '22px', height: '22px' }}>
                        <svg className="serp-favicon-icon" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" style={{ width: '13px', height: '13px' }}>
                          <path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 1.8 6.6 4.6 8.4L12 22l5.4-1.6C20.2 18.6 22 15.5 22 12c0-5.5-4.5-10-10-10z" />
                          <path d="M12 6v12M8 10l4-4 4 4" />
                        </svg>
                      </div>
                      <div className="serp-source-text">
                        <span className="serp-site-name" style={{ fontSize: '0.78rem' }}>Prana Air</span>
                        <span className="serp-url-breadcrumb" style={{ fontSize: '0.68rem' }}>
                          pranaair.com › blog › {slug || 'post-slug'}
                        </span>
                      </div>
                    </div>
                    <span className="serp-kebab-menu">⋮</span>
                  </div>

                  <div className="serp-preview-title serp-mobile-title">
                    {seoTitle || title || 'Post Title - Prana Air Blog'}
                  </div>

                  <div className="serp-body-layout">
                    <p className="serp-preview-desc">
                      <span className="serp-date-prefix">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — </span>
                      {seoDescription || excerpt || 'Search engine description preview will appear here. Write a clear summary to help readers discover this article on Google...'}
                    </p>
                    {featuredImage && (
                      <img src={featuredImage} alt="SERP thumbnail" className="serp-mobile-thumb" />
                    )}
                  </div>

                  <div className="serp-mobile-actions">
                    <span className="serp-mobile-action-pill">ℹ️ About this result</span>
                    <span className="serp-mobile-action-pill">↗ Share</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live SEO & Readability Dashboard */}
            <div className="seo-score-dashboard">
              {/* SEO Score Badge */}
              <div className="score-badge-card" style={{ borderLeft: `3.5px solid ${seoMetrics.seoColor}` }}>
                <div className="score-ring-wrap">
                  <svg className="score-ring-svg" viewBox="0 0 36 36">
                    <path
                      className="score-ring-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="score-ring-fill"
                      stroke={seoMetrics.seoColor}
                      strokeDasharray={`${seoMetrics.seoScore}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="score-ring-text" style={{ color: seoMetrics.seoColor }}>
                    {seoMetrics.seoScore}
                  </div>
                </div>
                <div className="score-details">
                  <div className="score-label">SEO Score</div>
                  <div className="score-status" style={{ color: seoMetrics.seoColor }}>
                    {seoMetrics.seoStatus}
                  </div>
                  <div className="score-subtext">{seoMetrics.wordCount} words</div>
                </div>
              </div>

              {/* Readability Score Badge */}
              <div className="score-badge-card" style={{ borderLeft: `3.5px solid ${seoMetrics.readabilityColor}` }}>
                <div className="score-ring-wrap">
                  <svg className="score-ring-svg" viewBox="0 0 36 36">
                    <path
                      className="score-ring-bg"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="score-ring-fill"
                      stroke={seoMetrics.readabilityColor}
                      strokeDasharray={`${seoMetrics.fleschScore}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="score-ring-text" style={{ color: seoMetrics.readabilityColor }}>
                    {seoMetrics.fleschScore}
                  </div>
                </div>
                <div className="score-details">
                  <div className="score-label">Readability</div>
                  <div className="score-grade-badge">Grade {seoMetrics.gradeLevel}</div>
                  <div className="score-subtext">{seoMetrics.readabilityLabel}</div>
                </div>
              </div>
            </div>

            {/* Expandable Issues & Solutions Accordion */}
            <div className="seo-audit-accordion">
              <button
                type="button"
                className="seo-audit-header-btn"
                onClick={() => setShowAuditDrawer(!showAuditDrawer)}
              >
                <div className="seo-audit-pills">
                  <span className={`seo-status-pill ${generalIssues.length > 0 ? 'warning' : 'good'}`}>
                    {generalIssues.length} Issues
                  </span>
                  <span className={`seo-status-pill ${hasCannibalization ? 'danger' : 'good'}`}>
                    {hasCannibalization ? '1 Cannibalized' : '0 Cannibalized'}
                  </span>
                  <span className="seo-status-pill good">
                    {seoMetrics.passed.length} Passed
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>{showAuditDrawer ? 'Hide' : 'View'}</span>
                  <span>{showAuditDrawer ? '▲' : '▼'}</span>
                </div>
              </button>

              {showAuditDrawer && (
                <>
                  <div className="seo-audit-tab-pills">
                    <button
                      type="button"
                      className={`seo-audit-tab-btn ${auditTab === 'issues' ? 'active' : ''}`}
                      onClick={() => setAuditTab('issues')}
                    >
                      Issues ({generalIssues.length})
                    </button>
                    <button
                      type="button"
                      className={`seo-audit-tab-btn ${auditTab === 'cannibalization' ? 'active' : ''}`}
                      onClick={() => setAuditTab('cannibalization')}
                      style={hasCannibalization ? { color: '#dc2626', fontWeight: 700 } : {}}
                    >
                      Cannibalization ({hasCannibalization ? '1' : '0'})
                    </button>
                    <button
                      type="button"
                      className={`seo-audit-tab-btn ${auditTab === 'passed' ? 'active' : ''}`}
                      onClick={() => setAuditTab('passed')}
                    >
                      Passed ({seoMetrics.passed.length})
                    </button>
                  </div>

                  {/* Claude AI Master Auto-Fix Header */}
                  <div className="seo-ai-auto-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.85rem' }}>⚡</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4c1d95' }}>
                        Claude AI Optimization
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-claude-ai-fix"
                      title="Fix every flagged issue Claude can handle: keyword, article body, then Title (45-60c), Slug and Meta Description (125-155c), re-checked against this audit"
                      onClick={handleAutoFixAll}
                      disabled={!!aiLoading}
                    >
                      {aiLoading === 'fix_all'
                        ? <><span className="seo-ai-spinner light" aria-hidden="true" /> {aiProgress || 'Claude Optimizing...'}</>
                        : '✨ Auto-Fix All with Claude'}
                    </button>
                  </div>

                  {(aiLoading || aiStepsShown) && (
                    <div className="seo-ai-progress" role="status" aria-live="polite">
                      <div className={`seo-ai-progress-bar ${aiLoading ? '' : 'complete'}`}><span /></div>
                      {aiSteps.length > 0 ? (
                        <ol className="seo-ai-steps">
                          {aiSteps.map(step => (
                            <li key={step.key} className={`seo-ai-step ${step.status}`}>
                              <span className="seo-ai-step-icon" aria-hidden="true">
                                {step.status === 'active' && <span className="seo-ai-spinner" />}
                                {step.status === 'done' && '✓'}
                                {step.status === 'failed' && '✕'}
                                {step.status === 'skipped' && '–'}
                                {step.status === 'pending' && '○'}
                              </span>
                              <span className="seo-ai-step-label">
                                {step.label}{step.detail ? <em> · {step.detail}</em> : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <div className="seo-ai-progress-label">
                          <span className="seo-ai-spinner" aria-hidden="true" />
                          {AI_ACTION_LABELS[aiLoading] || 'Claude is working…'}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`seo-audit-content ${aiLoading ? 'is-working' : ''}`}>
                    {auditTab === 'issues' && (
                      <>
                        {hasCannibalization && (() => {
                          const conflict = cannibalizationIssue.cannibalization.primaryConflict;
                          const highRisk = conflict.overlapScore >= 68;
                          return (
                            <div className={`cannibal-banner ${highRisk ? 'high' : ''}`} role="alert">
                              <div className="cannibal-banner-head">
                                <span className="cannibal-banner-icon" aria-hidden="true">⚠️</span>
                                <strong className="cannibal-banner-title">Keyword cannibalization</strong>
                                <span className="cannibal-banner-overlap" title={highRisk ? 'High conflict risk' : 'Moderate conflict risk'}>
                                  {conflict.overlapScore}% overlap
                                </span>
                              </div>
                              <div className="cannibal-banner-competing">
                                <span className="cannibal-banner-label">Competing with</span>
                                <a
                                  href={conflict.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cannibal-banner-link"
                                  title={`${decodeEntitiesForDisplay(conflict.title)} — open in a new tab`}
                                >
                                  {decodeEntitiesForDisplay(conflict.title)}
                                </a>
                              </div>
                              <div className="cannibal-banner-actions">
                                <button
                                  type="button"
                                  className="btn-claude-inline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAiFixSeo('differentiate_cannibalization');
                                  }}
                                  disabled={!!aiLoading}
                                >
                                  {aiLoading === 'differentiate_cannibalization' ? <><span className="seo-ai-spinner" aria-hidden="true" /> Fixing…</> : '✨ Differentiate'}
                                </button>
                                <button
                                  type="button"
                                  className="cannibal-banner-proof"
                                  onClick={() => setAuditTab('cannibalization')}
                                >
                                  See proof →
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                        {generalIssues.length === 0 ? (
                          <div style={{ color: '#16a34a', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                            🎉 Outstanding! No on-page SEO or readability issues found.
                          </div>
                        ) : (
                          generalIssues.map((item, idx) => {
                            const itemTitleLower = (item.title || '').toLowerCase();
                            let aiAction = null;
                            let aiBtnLabel = null;
                            if (itemTitleLower.includes('title')) {
                              aiAction = 'fix_title';
                              aiBtnLabel = '✨ Fix Title with Claude';
                            } else if (itemTitleLower.includes('description') || itemTitleLower.includes('excerpt')) {
                              aiAction = 'fix_description';
                              aiBtnLabel = '✨ Fix Description with Claude';
                            } else if (itemTitleLower.includes('slug')) {
                              aiAction = 'fix_slug';
                              aiBtnLabel = '✨ Fix Slug with Claude';
                            } else if (itemTitleLower.includes('stuffing') || itemTitleLower.includes('over-optimization')) {
                              aiAction = 'optimize_content';
                              aiBtnLabel = '✨ De-stuff & Add LSI Synonyms with Claude';
                            } else if (itemTitleLower.includes('e-e-a-t') || itemTitleLower.includes('ymyl') || itemTitleLower.includes('citation') || itemTitleLower.includes('disclaimer')) {
                              aiAction = 'fix_eeat_ymyl';
                              aiBtnLabel = '✨ Upgrade E-E-A-T & Add YMYL Disclaimer with Claude';
                            } else if (itemTitleLower.includes('body') || itemTitleLower.includes('density') || itemTitleLower.includes('missing from article body')) {
                              aiAction = 'optimize_content';
                              aiBtnLabel = '✨ Weave Keyword into Post Body with Claude';
                            } else if (itemTitleLower.includes('reading') || itemTitleLower.includes('readability') || itemTitleLower.includes('complex') || itemTitleLower.includes('sentence') || itemTitleLower.includes('jargon')) {
                              aiAction = 'fix_readability';
                              aiBtnLabel = '✨ Simplify Reading Level with Claude';
                            } else if (itemTitleLower.includes('no target keyword') || itemTitleLower.includes('keyword')) {
                              aiAction = 'suggest_keyword';
                              aiBtnLabel = '✨ Suggest Keyword with Claude';
                            }

                            return (
                              <div key={idx} className={`seo-issue-item ${item.type}`}>
                                <div className="seo-issue-title">
                                  <span>{item.type === 'error' ? '🔴' : '⚠️'}</span>
                                  <span>{item.title}</span>
                                </div>
                                <div className="seo-issue-desc">{item.issue}</div>
                                <div className="seo-issue-solution">
                                  💡 <strong>Solution:</strong> {item.solution}
                                </div>
                                {aiAction && (
                                  <button
                                    type="button"
                                    className="btn-claude-inline"
                                    onClick={() => handleAiFixSeo(aiAction)}
                                    disabled={!!aiLoading}
                                  >
                                    {aiLoading === aiAction ? <><span className="seo-ai-spinner" aria-hidden="true" /> Generating…</> : aiBtnLabel}
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </>
                    )}

                    {auditTab === 'cannibalization' && (
                      hasCannibalization ? (
                        <div className="seo-issue-item warning" style={{ borderLeftColor: '#f59e0b', background: '#fffdf5' }}>
                          <div className="seo-issue-title">
                            <span>⚠️</span>
                            <span>{cannibalizationIssue.title}</span>
                          </div>
                          <div className="seo-issue-desc">{cannibalizationIssue.issue}</div>

                          {cannibalizationIssue.cannibalization && (
                            <div className="cannibalization-proof-card">
                              <div className="cannibalization-proof-header">
                                <span className={`cannibalization-badge ${cannibalizationIssue.cannibalization.primaryConflict.overlapScore >= 68 ? 'high' : 'moderate'}`}>
                                  {cannibalizationIssue.cannibalization.primaryConflict.overlapScore >= 68 ? 'High Conflict Risk' : 'Moderate Conflict Risk'}
                                </span>
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>
                                  {cannibalizationIssue.cannibalization.primaryConflict.overlapScore}% Query Match
                                </span>
                              </div>

                              <div className="cannibalization-conflict-box">
                                <span className="cannibalization-conflict-label">Competing Published Article:</span>
                                <div className="cannibalization-conflict-title">{cannibalizationIssue.cannibalization.primaryConflict.title}</div>
                                <a
                                  href={cannibalizationIssue.cannibalization.primaryConflict.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="cannibalization-conflict-url"
                                >
                                  🔗 {cannibalizationIssue.cannibalization.primaryConflict.url}
                                </a>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#475569' }}>Shared Target Keywords:</span>
                                <div className="cannibalization-keywords-row">
                                  {cannibalizationIssue.cannibalization.overlappingKeywords.map((kw, kwIdx) => (
                                    <span key={kwIdx} className="cannibalization-kw-pill">
                                      #{kw}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="cannibalization-proof-text">
                                <strong>SEO Impact Proof:</strong> {cannibalizationIssue.proof?.riskAnalysis}
                              </div>

                              <div className="cannibalization-actions-row">
                                <button
                                  type="button"
                                  className="cannibalization-quick-btn claude-ai"
                                  title="Rewrite title, slug, and angle with Claude to target a distinct non-competing keyword"
                                  onClick={() => handleAiFixSeo('differentiate_cannibalization')}
                                  disabled={!!aiLoading}
                                >
                                  {aiLoading === 'differentiate_cannibalization' ? <><span className="seo-ai-spinner" aria-hidden="true" /> Differentiating…</> : '✨ Differentiate with Claude'}
                                </button>
                                <button
                                  type="button"
                                  className="cannibalization-quick-btn primary"
                                  title="Set canonical slug to point to this published master article"
                                  onClick={() => {
                                    setCanonicalMode('custom');
                                    setCanonicalUrl(cannibalizationIssue.cannibalization.primaryConflict.url);
                                    showNotification('Canonical slug set to master article URL!', 'success');
                                  }}
                                >
                                  🎯 Set as Master Canonical URL
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="seo-issue-solution">
                            💡 <strong>Action Plan:</strong> {cannibalizationIssue.solution}
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '1.25rem 1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.45rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '1.75rem' }}>🎉</span>
                          <span style={{ fontWeight: 700, color: '#166534', fontSize: '0.88rem' }}>Topical Exclusivity Verified</span>
                          <span style={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.45 }}>
                            No keyword cannibalization detected against {existingPosts.length} published articles. This article occupies distinct search territory with zero internal competition.
                          </span>
                        </div>
                      )
                    )}

                    {auditTab === 'passed' && (
                      seoMetrics.passed.map((item, idx) => (
                        <div key={idx} className="seo-passed-item">
                          <div className="seo-passed-title">
                            <span>✅</span>
                            <span>{item.title}</span>
                          </div>
                          <div className="seo-passed-desc">{item.detail}</div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Canonical Slug & Status (Compact) */}
            <div className="canonical-compact-card">
              <div className="canonical-compact-header">
                <div className="canonical-title-row">
                  <label className="canonical-section-label" style={{ margin: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    Canonical Slug
                  </label>
                  <span className={`seo-status-pill ${canonicalMode === 'self' ? 'good' : 'warning'}`}>
                    {canonicalMode === 'self' ? 'Self' : 'Not Self'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (canonicalMode === 'self') {
                      setCanonicalMode('custom');
                    } else {
                      setCanonicalMode('self');
                      setCanonicalUrl('');
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: 0
                  }}
                >
                  {canonicalMode === 'self' ? 'Edit' : 'Set to Self'}
                </button>
              </div>

              {canonicalMode === 'self' ? (
                <div className="canonical-slug-display">
                  <span className="canonical-slug-prefix">pranaair.com/blog/</span>
                  <span className="canonical-slug-val">{slug || 'post-slug'}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.2rem' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem', background: '#ffffff', flex: 1 }}
                    placeholder="Custom slug or master URL..."
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCanonicalUrl('');
                      setCanonicalMode('self');
                    }}
                    className="cannibalization-quick-btn"
                    title="Reset to default self-referential URL"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* URL Slug with Lock/Edit */}
            <div className="form-group" style={{ marginTop: '1.1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>URL Slug</label>
                  <button
                    type="button"
                    className="btn-claude-field-quick"
                    title="Generate clean SEO slug with Claude"
                    onClick={() => handleAiFixSeo('fix_slug')}
                    disabled={!!aiLoading}
                  >
                    {aiLoading === 'fix_slug' ? '✨ Generating...' : '✨ AI Slug'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSlugLocked(!isSlugLocked)}
                  style={{ background: 'none', border: 'none', color: isSlugLocked ? '#2563eb' : '#16a34a', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                >
                  {isSlugLocked ? '🔒 Edit Slug' : '🔓 Lock Slug'}
                </button>
              </div>
              <input
                type="text"
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                value={slug}
                disabled={isSlugLocked}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="url-slug"
              />
            </div>

            {/* Primary Target Keyword Setting */}
            <div className="primary-keyword-card" style={{ marginTop: '0.9rem', marginBottom: '0.9rem' }}>
              <div className="primary-keyword-header">
                <label className="primary-keyword-label" htmlFor="primary-keyword-input">
                  <span>🎯</span>
                  <span>Primary Target Keyword</span>
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn-claude-inline"
                    style={{ margin: 0, padding: '0.22rem 0.55rem', fontSize: '0.68rem' }}
                    onClick={() => handleAiFixSeo('suggest_keyword')}
                    disabled={!!aiLoading}
                    title="Analyze article content and generate the best high-intent target keyword with Claude"
                  >
                    {aiLoading === 'suggest_keyword' ? '✨ Suggesting...' : '✨ AI Suggest'}
                  </button>
                  {primaryKeyword.trim() && (
                    <button
                      type="button"
                      className="btn-claude-inline"
                      style={{ margin: 0, padding: '0.22rem 0.55rem', fontSize: '0.68rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}
                      onClick={() => handleAiFixSeo('optimize_content')}
                      disabled={!!aiLoading}
                      title="Weave target keyword into article body, introduction & subheadings with Claude"
                    >
                      {aiLoading === 'optimize_content' ? '✨ Updating...' : '✨ Optimize Body'}
                    </button>
                  )}
                </div>
              </div>

              <div className="primary-keyword-input-wrap">
                <input
                  id="primary-keyword-input"
                  type="text"
                  className="primary-keyword-input"
                  placeholder="e.g. airborne microplastics, indoor air quality"
                  value={primaryKeyword}
                  onChange={(e) => setPrimaryKeyword(e.target.value)}
                />
              </div>

              {primaryKeyword.trim() ? (
                <div className="primary-keyword-stats">
                  <span className={`keyword-stat-pill ${seoMetrics.keywordInTitle ? 'found' : 'missing'}`}>
                    {seoMetrics.keywordInTitle ? '✓ In Title' : '✕ Title'}
                  </span>
                  <span className={`keyword-stat-pill ${seoMetrics.keywordInSlug ? 'found' : 'missing'}`}>
                    {seoMetrics.keywordInSlug ? '✓ In Slug' : '✕ Slug'}
                  </span>
                  <span className={`keyword-stat-pill ${seoMetrics.keywordInDesc ? 'found' : 'missing'}`}>
                    {seoMetrics.keywordInDesc ? '✓ In Description' : '✕ Description'}
                  </span>
                  <span className={`keyword-stat-pill ${seoMetrics.keywordMatches > 0 && seoMetrics.keywordDensity <= 2.8 ? 'found' : 'missing'}`}>
                    {seoMetrics.keywordMatches}× ({seoMetrics.keywordDensity}%)
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Target keyword benchmarks on-page SEO Title, Slug, Description &amp; Content Density.
                </div>
              )}
            </div>

            {/* SEO Title with Metric Bar */}
            <div className="form-group" style={{ marginTop: '0.85rem' }}>
              <div className="seo-metric-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>SEO Meta Title ({selectedLang.toUpperCase()})</label>
                  <button
                    type="button"
                    className="btn-claude-field-quick"
                    title="Optimize title for 45-60 chars with Claude"
                    onClick={() => handleAiFixSeo('fix_title')}
                    disabled={!!aiLoading}
                  >
                    {aiLoading === 'fix_title' ? '✨ Optimizing...' : '✨ AI Title'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className={`seo-status-pill ${
                    (seoTitle || title).length === 0 ? 'danger' :
                    (seoTitle || title).length < 35 ? 'warning' :
                    (seoTitle || title).length <= 60 ? 'good' : 'danger'
                  }`}>
                    {(seoTitle || title).length === 0 ? 'Missing' :
                     (seoTitle || title).length < 35 ? 'Short' :
                     (seoTitle || title).length <= 60 ? 'Optimal' : 'Too Long'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: (seoTitle || title).length > 60 ? '#ef4444' : '#6b7280' }}>
                    {(seoTitle || title).length}/60
                  </span>
                </div>
              </div>
              <input
                type="text"
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                placeholder={title || 'Custom SEO title...'}
                value={seoTitle}
                onChange={(e) => onSeoTitleChange(e.target.value)}
              />
              <div className="seo-progress-track">
                <div
                  className="seo-progress-bar"
                  style={{
                    width: `${Math.min(100, ((seoTitle || title).length / 60) * 100)}%`,
                    backgroundColor:
                      (seoTitle || title).length === 0 ? '#ef4444' :
                      (seoTitle || title).length < 35 ? '#f59e0b' :
                      (seoTitle || title).length <= 60 ? '#22c55e' : '#ef4444'
                  }}
                />
              </div>
            </div>

            {/* COMBINED: Excerpt / Summary & SEO Meta Description */}
            <div className="form-group" style={{ marginTop: '0.85rem' }}>
              <div className="seo-metric-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Meta Description ({selectedLang.toUpperCase()})</label>
                  <button
                    type="button"
                    className="btn-claude-field-quick"
                    title="Generate 125-155 char description with Claude"
                    onClick={() => handleAiFixSeo('fix_description')}
                    disabled={!!aiLoading}
                  >
                    {aiLoading === 'fix_description' ? '✨ Generating...' : '✨ AI Description'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className={`seo-status-pill ${
                    (seoDescription || excerpt).length === 0 ? 'danger' :
                    (seoDescription || excerpt).length < 110 ? 'warning' :
                    (seoDescription || excerpt).length <= 160 ? 'good' : 'danger'
                  }`}>
                    {(seoDescription || excerpt).length === 0 ? 'Missing' :
                     (seoDescription || excerpt).length < 110 ? 'Short' :
                     (seoDescription || excerpt).length <= 160 ? 'Optimal' : 'Too Long'}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: (seoDescription || excerpt).length > 160 ? '#ef4444' : '#6b7280' }}>
                    {(seoDescription || excerpt).length}/160
                  </span>
                </div>
              </div>
              <textarea
                className="input-text"
                style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder={`Unified summary for Google search snippet and blog card excerpt in ${selectedLang.toUpperCase()}...`}
                value={seoDescription || excerpt}
                onChange={(e) => onCombinedDescriptionChange(e.target.value)}
              />
              <div className="seo-progress-track">
                <div
                  className="seo-progress-bar"
                  style={{
                    width: `${Math.min(100, ((seoDescription || excerpt).length / 160) * 100)}%`,
                    backgroundColor:
                      (seoDescription || excerpt).length === 0 ? '#ef4444' :
                      (seoDescription || excerpt).length < 110 ? '#f59e0b' :
                      (seoDescription || excerpt).length <= 160 ? '#22c55e' : '#ef4444'
                  }}
                />
              </div>
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
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <input
                    type="text"
                    className="input-text"
                    style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem', flexGrow: 1 }}
                    placeholder="Image Alt Text (SEO)..."
                    value={featuredImageAlt}
                    onChange={(e) => { setFeaturedImageAlt(e.target.value); setAltHint(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (altIsDirty && altSaveState !== 'saving') handleSaveAltText();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSaveAltText}
                    className="btn btn-primary"
                    disabled={!altIsDirty || altSaveState === 'saving'}
                    title={!postId
                      ? 'Save the post first, then alt text can be saved on its own'
                      : (altIsDirty ? 'Save the alt text for this image' : 'Alt text is up to date')}
                    style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap', minWidth: '5.5rem' }}
                  >
                    {altSaveState === 'saving' ? 'Saving…' : altSaveState === 'saved' ? '✓ Saved' : 'Save'}
                  </button>
                </div>
                {altLookupLoading && !altHint && (
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '-0.35rem', fontStyle: 'italic' }}>
                    Looking up the original alt text…
                  </div>
                )}
                {altHint && (
                  <div style={{ fontSize: '0.72rem', color: '#2563eb', marginTop: '-0.35rem' }}>
                    ↳ {altHint}
                  </div>
                )}
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
        </div>
      </div>

      {showTranslateModal && (
        <div className="modal-overlay">
          <div className="modal-card modal-sm translate-modal">
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1f2937' }}>Auto-Translate Post</h3>

            {!translating && !translateResult ? (
              <>
                <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1.5rem' }}>Select the languages you want to translate the English content to.</p>

                <div className="translate-lang-grid">
                  {Object.entries({ hi: 'Hindi', es: 'Spanish', de: 'German', fr: 'French', ru: 'Russian', ja: 'Japanese', 'pt-PT': 'Portuguese' }).map(([code, name]) => (
                    <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={translateLangs[code]}
                        onChange={e => setTranslateLangs({ ...translateLangs, [code]: e.target.checked })}
                        style={{ width: '1.1rem', height: '1.1rem' }}
                      />
                      <span style={{ fontSize: '0.9rem', color: '#374151', fontWeight: 500 }}>{name}</span>
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                  <button
                    onClick={() => setShowTranslateModal(false)}
                    style={{ padding: '0.5rem 1rem', background: '#f3f4f6', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', color: '#4b5563' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTranslateAll}
                    style={{ padding: '0.5rem 1rem', background: '#4f46e5', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', color: 'white' }}
                  >
                    Translate
                  </button>
                </div>
              </>
            ) : (
              <div className="translate-progress">
                {translateResult ? (
                  <p className={`translate-result-summary ${translateResult.type}`}>
                    {translateResult.type === 'success' && `Done — all ${translateResult.succeeded} language(s) translated successfully.`}
                    {translateResult.type === 'partial' && `${translateResult.succeeded} language(s) translated. Failed: ${translateResult.failed.join(', ')}.`}
                    {translateResult.type === 'failed' && 'Translation failed for all selected languages.'}
                    {translateResult.type === 'cancelled' && `Cancelled. ${translateResult.succeeded} language(s) had already finished before you stopped it.`}
                  </p>
                ) : (
                  <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '1.25rem' }}>Translating your post — this can take a minute for longer articles.</p>
                )}
                <ul className="translate-progress-list">
                  {Object.entries({ hi: 'Hindi', es: 'Spanish', de: 'German', fr: 'French', ru: 'Russian', ja: 'Japanese', 'pt-PT': 'Portuguese' })
                    .filter(([code]) => translateLangs[code])
                    .map(([code, name]) => {
                      const state = translateProgress[code] || 'pending';
                      const stateLabel = {
                        success: 'Done',
                        error: 'Failed',
                        cancelled: 'Cancelled',
                        pending: translating ? 'Translating…' : 'Skipped'
                      }[state];
                      return (
                        <li key={code} className={`translate-progress-item ${state}`}>
                          <span className="translate-progress-icon">
                            {state === 'success' && (
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            )}
                            {(state === 'error' || state === 'cancelled') && (
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            )}
                            {state === 'pending' && translating && <span className="translate-spinner" />}
                          </span>
                          <span className="translate-progress-label">{name}</span>
                          <span className="translate-progress-state">{stateLabel}</span>
                        </li>
                      );
                    })}
                </ul>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.25rem' }}>
                  {translating && (
                    <button
                      onClick={handleCancelTranslate}
                      style={{ padding: '0.5rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', color: '#dc2626' }}
                    >
                      Cancel
                    </button>
                  )}
                  {translateResult && (
                    <button
                      onClick={() => { setShowTranslateModal(false); setTranslateProgress({}); setTranslateResult(null); }}
                      style={{ padding: '0.5rem 1rem', background: '#4f46e5', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', color: 'white' }}
                    >
                      Close
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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

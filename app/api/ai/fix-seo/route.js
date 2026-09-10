import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/adminAuth';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

// Rough chars-per-token estimate used only to size max_tokens for the
// article-body rewrite (billing is on real tokens, so over-sizing is free).
const estimateTokens = (str) => Math.ceil((str || '').length / 2.5);

const stripHtml = (html) => (html || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const countTag = (html, tag) => ((html || '').match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;

const wordCount = (str) => (str || '').split(/\s+/).filter(Boolean).length;

// Last resort when the model still miscounts after several tries: trim at a
// sentence boundary if that leaves enough text, else at a word boundary, so
// the editor audit's character ranges are guaranteed to pass.
const DANGLING_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'before', 'after', 'from', 'as', 'that', 'which', 'while', 'into', 'than', 'so']);

function fitToRange(text, max, min, endWithPeriod) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastSentence > 0 && lastSentence + 1 >= min) return cut.slice(0, lastSentence + 1).trim();
  const lastSpace = cut.lastIndexOf(' ');
  const words = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).split(/\s+/).filter(Boolean);
  // Don't end on "…sensors before." — back up past connectives and articles.
  while (words.length > 1 && DANGLING_WORDS.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) {
    words.pop();
  }
  const trimmed = words.join(' ').replace(/[\s,;:\-–—]+$/, '');
  return endWithPeriod && !/[.!?]$/.test(trimmed) ? `${trimmed}.` : trimmed;
}

const slugify = (str) => (str || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// Forces a tool call so the API itself guarantees a well-formed object
// matching the schema. The older actions below ask for "raw JSON" as text
// and then try to repair whatever comes back (safeExtractJson); for a long
// HTML body inside a JSON string that repair step is exactly where Auto-Fix
// used to lose fields and silently apply only part of the fix. Streaming is
// used because the SDK refuses non-streaming calls whose max_tokens implies
// a >10 minute wait, which the body rewrite can reach.
async function callStructured(anthropic, { system, prompt, tool, maxTokens, temperature = 0.3 }) {
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: prompt }]
  });
  const response = await stream.finalMessage();
  const toolUse = response.content.find(block => block.type === 'tool_use');
  return { input: toolUse?.input || null, stopReason: response.stop_reason };
}

const YMYL_DISCLAIMER_HTML = `<div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 1rem 1.25rem; margin-top: 2rem; margin-bottom: 1.5rem; border-radius: 6px; font-size: 0.85rem; color: #475569; line-height: 1.5;"><strong style="color: #1e3a8a;">Environmental Health &amp; Research Notice:</strong> This article is published by Prana Air for environmental awareness and educational purposes based on peer-reviewed environmental research and WHO/EPA benchmarks. It does not constitute medical diagnosis or individual treatment advice. Consult qualified healthcare professionals regarding respiratory or cardiovascular concerns.</div>`;

// Each directive maps 1:1 to an audit finding in the editor
// (analyzeReadabilityAndSeo). The Auto-Fix pipeline sends only the ones the
// audit actually flagged, so the body is rewritten once with a focused
// brief instead of once per issue.
const CONTENT_DIRECTIVES = {
  keyword_body: (kw) => `Weave "${kw}" naturally into the opening 100–150 words, into 1–2 <h2>/<h3> subheadings, and across the body so it makes up roughly 1.0%–1.8% of all words.`,
  destuff: (kw) => `"${kw}" is currently over-used (keyword stuffing). Replace excess repetitions with natural synonyms and related phrases so it makes up no more than 1.8% of all words, while still appearing in the introduction.`,
  readability: () => 'Rewrite long or academic sentences into clear sentences of 12–18 words. Replace three-syllable jargon with plain equivalents ("utilize" → "use", "concentrations" → "levels", "accumulate" → "build up"). Target Flesch Reading Ease 65+ (Grade 7–8).',
  headings: () => 'The article has no <h2> subheadings. Split the body into logical sections and add descriptive <h2> headings (and <h3> where useful) without removing any existing content.',
  eeat: () => 'Add authority signals: where a claim is made, attribute it in prose to a recognized source such as the World Health Organization (WHO) air quality guidelines, EPA standards, or peer-reviewed research. Name the organization or guideline; do not invent URLs, study titles, or statistics.',
  ymyl: () => `Insert this disclaimer block, exactly as given, immediately before the final concluding section (or as the last element if there is no conclusion):\n${YMYL_DISCLAIMER_HTML}`
};

export async function POST(req) {
  try {
    const authenticated = await isAdminAuthenticated(req);
    if (!authenticated) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const {
      action,
      title,
      slug,
      description,
      content,
      language = 'en',
      primaryKeyword = '',
      competingArticle,
      conflictingPost,
      overlappingKeywords = [],
      needsReadabilityFix = false,
      directives = [],
      feedback = []
    } = await req.json();

    const conflict = competingArticle || conflictingPost;

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'Claude API key is missing. Set CLAUDE_API_KEY in the environment.'
      }, { status: 400 });
    }

    const anthropic = new Anthropic({
      apiKey,
      maxRetries: 3
    });

    // Strip HTML to get clean plain text context (up to 2500 chars)
    const plainContent = (content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);

    const brandSystemPrompt = 'You are an elite SEO strategist and copywriter for Prana Air, a leading environmental health & air quality monitoring brand. You write concise, high-CTR, Google-optimized copy that follows strict, literal character limits and clear readability standards.';

    // ------------------------------------------------------------------
    // fix_content: one focused rewrite of the article body covering only
    // the directives the audit flagged. Used by Auto-Fix All.
    // ------------------------------------------------------------------
    if (action === 'fix_content') {
      const list = (Array.isArray(directives) ? directives : []).filter(d => CONTENT_DIRECTIVES[d]);
      if (!content || !content.trim()) {
        return NextResponse.json({ success: false, error: 'There is no article body to optimize yet.' }, { status: 400 });
      }
      if (list.length === 0) {
        return NextResponse.json({ success: false, error: 'No content directives were provided.' }, { status: 400 });
      }

      const effectiveKeyword = (primaryKeyword || '').trim() || (title || '').split(':')[0].trim() || 'indoor air quality';
      const directiveText = list.map((d, i) => `${i + 1}. ${CONTENT_DIRECTIVES[d](effectiveKeyword)}`).join('\n');

      const userPrompt = `Task: Revise the HTML body of this blog post so that every directive below is satisfied, then call submit_revised_content with the COMPLETE revised HTML.

Article Title: "${title || ''}"
Primary Target Keyword: "${effectiveKeyword}"
Target Language: ${language}

DIRECTIVES:
${directiveText}

NON-NEGOTIABLE RULES:
- Return the complete article. Never summarize, shorten, or drop sections, paragraphs, list items, tables, images, links, or embedded blocks.
- Preserve every existing HTML tag and attribute verbatim (class, style, src, href, data-*). Change text content only, apart from the headings or disclaimer a directive explicitly asks you to add.
- Keep the same language as the source text.
- Do not add an <h1>; the page renders the title separately.

CURRENT HTML:
${content}`;

      const tool = {
        name: 'submit_revised_content',
        description: 'Submit the complete revised HTML body of the blog post.',
        input_schema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The complete revised HTML body, nothing omitted.' },
            summary: { type: 'string', description: 'One sentence describing what was changed.' }
          },
          required: ['content', 'summary']
        }
      };

      // The rewrite is at least as long as the source, and the E-E-A-T and
      // YMYL directives add text, so budget generously (Haiku 4.5 allows up
      // to 64k output tokens).
      const maxTokens = Math.min(32000, Math.max(4000, Math.ceil(estimateTokens(content) * 1.6) + 1500));
      const { input, stopReason } = await callStructured(anthropic, {
        system: brandSystemPrompt,
        prompt: userPrompt,
        tool,
        maxTokens
      });

      if (stopReason === 'max_tokens') {
        return NextResponse.json({
          success: false,
          error: 'The article is too long to rewrite in a single pass. Fix the body issues section by section instead.'
        }, { status: 422 });
      }
      if (!input?.content || !input.content.trim()) {
        return NextResponse.json({ success: false, error: 'Claude returned no article content. Please try again.' }, { status: 500 });
      }

      // Never let a lossy rewrite replace the author's article.
      const beforeText = stripHtml(content);
      const afterText = stripHtml(input.content);
      if (afterText.length < beforeText.length * 0.6) {
        const pct = Math.round((1 - afterText.length / Math.max(1, beforeText.length)) * 100);
        return NextResponse.json({
          success: false,
          error: `The rewrite came back ${pct}% shorter than the original, so it was not applied. Please try again.`
        }, { status: 422 });
      }
      if (countTag(input.content, 'img') < countTag(content, 'img') || countTag(input.content, 'a') < countTag(content, 'a')) {
        return NextResponse.json({
          success: false,
          error: 'The rewrite dropped images or links from the article, so it was not applied. Please try again.'
        }, { status: 422 });
      }

      return NextResponse.json({
        success: true,
        data: { content: input.content, optimizationsApplied: input.summary || '' }
      });
    }

    // ------------------------------------------------------------------
    // fix_metadata: title + slug + description in one call, driven by the
    // editor's own audit feedback and verified against the same character
    // ranges the audit uses. Used by Auto-Fix All.
    // ------------------------------------------------------------------
    if (action === 'fix_metadata') {
      const kw = (primaryKeyword || '').trim();
      const kwLower = kw.toLowerCase();
      // Words that ARE the keyword can't be avoided without losing the
      // keyword; only ask the model to steer clear of the rest.
      const rawTerms = Array.isArray(overlappingKeywords) && overlappingKeywords.length > 0
        ? overlappingKeywords
        : (conflict?.matchingKeywords || []);
      const avoidTerms = rawTerms
        .map(t => String(t).trim())
        .filter(t => t && !kwLower.includes(t.toLowerCase()));
      const feedbackList = (Array.isArray(feedback) ? feedback : []).map(f => String(f).trim()).filter(Boolean);

      const tool = {
        name: 'submit_seo_metadata',
        description: 'Submit the rewritten SEO title, URL slug and meta description.',
        input_schema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'SEO title, 45–60 characters inclusive.' },
            slug: { type: 'string', description: 'Lowercase hyphenated URL slug under 50 characters.' },
            description: { type: 'string', description: 'Meta description, 125–155 characters inclusive.' },
            differentiatedAngle: { type: 'string', description: 'If a cannibalization conflict was given: one sentence on the distinct angle chosen. Otherwise an empty string.' }
          },
          required: ['title', 'slug', 'description']
        }
      };

      const buildPrompt = (extraFeedback) => {
        const allFeedback = [...feedbackList, ...extraFeedback];
        return `Task: Rewrite the SEO metadata for this blog post so that EVERY item under AUDIT FEEDBACK is resolved, then call submit_seo_metadata. The audit is a literal character-count and keyword check, so count characters precisely.

Current Title: "${title || ''}"
Current Slug: "${slug || ''}"
Current Description: "${description || ''}"
Primary Target Keyword: ${kw ? `"${kw}"` : '(none set)'}
Target Language: ${language}
Article Summary: "${plainContent.slice(0, 1200)}"
${conflict ? `
KEYWORD CANNIBALIZATION: the published article "${conflict.title}" (${conflict.url || ''}) already targets this query. Give this post a clearly distinct, more specific angle.${avoidTerms.length ? ` The new title and slug must NOT contain any of these words: [${avoidTerms.join(', ')}].` : ''}` : ''}

AUDIT FEEDBACK (all must pass):
${allFeedback.length ? allFeedback.map((f, i) => `${i + 1}. ${f}`).join('\n') : '1. Bring every field into the ranges below.'}

RULES:
1. "title": 45–60 characters inclusive (about 7–9 words)${kw ? `, containing "${kw}" verbatim within the first 25 characters` : ''}. It must describe the article's real subject.
2. "slug": lowercase words joined by single hyphens, 3–7 words, under 50 characters${kw ? `, containing "${slugify(kw)}"` : ''}. No filler words such as "the", "and", "of".
3. "description": 125–155 characters inclusive (about 20–24 words, one or two sentences)${kw ? `, containing "${kw}" verbatim` : ''}, summarizing the article's value and ending with an active call to action.
4. Count every character (including spaces) before answering. Anything outside the ranges is rejected.`;
      };

      // Cheap deterministic re-check: the model occasionally miscounts by a
      // few characters, and a retry with the exact count fixes that far
      // more reliably than a fresh attempt from the editor.
      let result = null;
      let lengthFeedback = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const { input } = await callStructured(anthropic, {
          system: brandSystemPrompt,
          prompt: buildPrompt(lengthFeedback),
          tool,
          maxTokens: 1000,
          temperature: Math.min(0.3 + attempt * 0.2, 0.7)
        });
        if (!input) continue;

        const candidate = {
          title: String(input.title || '').trim(),
          slug: slugify(input.slug || input.title),
          description: String(input.description || '').trim(),
          differentiatedAngle: String(input.differentiatedAngle || '').trim()
        };
        result = candidate;

        lengthFeedback = [];
        if (candidate.title.length < 40 || candidate.title.length > 60) {
          lengthFeedback.push(`Your previous title "${candidate.title}" was ${candidate.title.length} characters (${wordCount(candidate.title)} words); it must be 45–60 characters, about 7–9 words. ${candidate.title.length > 60 ? 'Drop a word or two.' : 'Add one specific word.'}`);
        }
        if (candidate.description.length < 120 || candidate.description.length > 160) {
          lengthFeedback.push(`Your previous description was ${candidate.description.length} characters (${wordCount(candidate.description)} words); it must be 125–155 characters, about 20–24 words. ${candidate.description.length > 160 ? 'Cut a clause; do not add anything.' : 'Add one short, concrete benefit; no filler.'}`);
        }
        if (candidate.slug.length > 60 || candidate.slug.split('-').length < 2) {
          lengthFeedback.push(`Your previous slug "${candidate.slug}" was ${candidate.slug.length} characters; keep it under 50 with at least 3 words.`);
        }
        if (lengthFeedback.length === 0) break;
      }

      if (!result) {
        return NextResponse.json({ success: false, error: 'Claude returned no metadata. Please try again.' }, { status: 500 });
      }

      // The editor audit flags descriptions over 165 and titles over 65
      // characters; guarantee we never hand back something it will reject.
      if (result.description.length > 160) {
        result.description = fitToRange(result.description, 158, 100, true);
      }
      if (result.title.length > 65) {
        result.title = fitToRange(result.title, 60, 0, false);
      }

      return NextResponse.json({ success: true, data: result });
    }

    let systemPrompt = 'You are an elite SEO strategist and copywriter for Prana Air, a leading environmental health & air quality monitoring brand. You write concise, high-CTR, Google-optimized metadata following strict character limits and clear readability standards. Always respond ONLY with a raw valid JSON object without markdown fences or backticks.';
    let userPrompt = '';
    let maxTokens = 600;

    if (action === 'suggest_keyword') {
      userPrompt = `Task: Analyze this blog post title and content, then identify the single most effective, high-intent PRIMARY TARGET KEYWORD (2 to 4 words) to rank on Google.
Article Title: "${title || ''}"
Article Content Summary: "${plainContent.slice(0, 1500)}"
Target Language: ${language}

Requirements:
1. "primaryKeyword": A concise 2-4 word focus keyphrase (e.g. "airborne microplastics", "indoor air quality", "microplastics in air") that represents the main search query readers use to find this article.
2. "searchIntent": One of "Informational", "Commercial", "Investigational".
3. "rationale": 1 sentence explaining why this keyword is the best ranking opportunity.

Respond ONLY with this JSON structure:
{
  "primaryKeyword": "recommended target keyword",
  "searchIntent": "Informational",
  "rationale": "High search volume and direct alignment with the article focus."
}`;
    } else if (action === 'fix_title') {
      userPrompt = `Task: Optimize this blog post title for Google search results.
Current Title: "${title || 'Untitled'}"
${primaryKeyword ? `Primary Target Keyword to Include: "${primaryKeyword}"` : ''}
Current Content Summary: "${plainContent.slice(0, 600)}"
Target Language: ${language}

Requirements:
1. "title": Must be captivating, high-CTR, and strictly between 45 and 60 characters in length. ${primaryKeyword ? `Must naturally include "${primaryKeyword}" near the front.` : 'Include primary target keywords naturally.'}
2. "slug": Clean, lowercase, hyphen-separated URL slug matching the title${primaryKeyword ? ` and containing "${primaryKeyword.replace(/\\s+/g, '-')}"` : ''}.

Respond ONLY with this JSON structure:
{
  "title": "Optimized Title Here",
  "slug": "optimized-title-here"
}`;
    } else if (action === 'fix_description') {
      userPrompt = `Task: Write an engaging Google SERP meta description and article excerpt.
Article Title: "${title || 'Air Quality & Health'}"
${primaryKeyword ? `Primary Target Keyword to Include: "${primaryKeyword}"` : ''}
Article Content: "${plainContent.slice(0, 1000)}"
Current Description: "${description || ''}"
Target Language: ${language}

Requirements:
1. "description": A compelling Google search snippet strictly between 125 and 155 characters. ${primaryKeyword ? `Naturally include "${primaryKeyword}".` : ''} Summarize the core value and include an active call to action or hook that drives search clicks.

Respond ONLY with this JSON structure:
{
  "description": "Compelling meta description between 125-155 characters here."
}`;
    } else if (action === 'fix_slug') {
      userPrompt = `Task: Generate a concise, search-engine friendly URL slug.
Current Title: "${title || ''}"
Current Slug: "${slug || ''}"
${primaryKeyword ? `Primary Target Keyword: "${primaryKeyword}"` : ''}

Requirements:
1. "slug": Clean, lowercase, hyphenated, 3 to 6 words focusing on primary keywords${primaryKeyword ? ` (including "${primaryKeyword.replace(/\\s+/g, '-')}")` : ''}, strictly under 50 characters.

Respond ONLY with this JSON structure:
{
  "slug": "concise-seo-slug"
}`;
    } else if (action === 'differentiate_cannibalization') {
      const avoidTerms = Array.isArray(overlappingKeywords) && overlappingKeywords.length > 0
        ? overlappingKeywords.join(', ')
        : (conflict?.matchingKeywords || []).join(', ');

      userPrompt = `Task: Differentiate this blog post to completely ELIMINATE a Keyword Cannibalization conflict with an existing published article on our website.
Current Draft Title: "${title || ''}"
Current Slug: "${slug || ''}"
${primaryKeyword ? `Primary Target Keyword: "${primaryKeyword}"` : ''}
Competing Published Article Title: "${conflict?.title || ''}"
Competing Published URL: "${conflict?.url || ''}"
Shared Overlapping Keywords TO AVOID: [${avoidTerms || 'home, your home'}]
Article Content Preview: "${plainContent.slice(0, 1000)}"
Target Language: ${language}

Problem:
Both articles target overlapping keywords, causing internal competition and diluted Google rankings.

Goal:
Shift this draft article to a distinct, non-overlapping long-tail angle (e.g. focused on indoor airborne microplastics health risks, scientific detection, or room air quality benchmarks).
CRITICAL RULE: The new "title" and "slug" MUST NOT contain ANY of the shared words: [${avoidTerms || 'home, your home'}]. For instance, replace "home" with "Indoor Spaces", "Living Areas", or "Enclosed Rooms".

Requirements:
1. "title": Differentiated title strictly between 45 and 60 characters targeting the unique angle with zero overlap.
2. "slug": Matching clean lowercase hyphen-separated URL slug under 50 characters.
3. "description": Differentiated meta description between 125 and 155 characters.
4. "differentiatedAngle": 1 clear sentence explaining how this new angle eliminates keyword cannibalization.

Respond ONLY with this JSON structure:
{
  "title": "Differentiated Title Here",
  "slug": "differentiated-slug-here",
  "description": "Differentiated meta description between 125-155 characters here.",
  "differentiatedAngle": "Explanation of the new search angle."
}`;
    } else if (action === 'optimize_content' || action === 'fix_content_keyword') {
      const effectiveKeyword = (primaryKeyword || '').trim() || (title || '').split(':')[0].trim() || 'indoor air quality';
      userPrompt = `Task: Strategically optimize the main HTML body of this blog post to naturally integrate and relate the primary target keyword "${effectiveKeyword}" for Google ranking and topical authority.

Article Title: "${title || ''}"
Primary Target Keyword: "${effectiveKeyword}"
Target Language: ${language}

Current HTML Content:
${content || ''}

SEO Copywriting & Content Optimization Directives:
1. Target Keyword Placement (Wise & Natural):
   - Weave "${effectiveKeyword}" seamlessly into the opening 100-150 words of the introduction to immediately signal topical relevance to search engines.
   - Weave "${effectiveKeyword}" (or natural semantic variations) into at least 1 or 2 relevant subheadings (<h2> or <h3>).
   - Distribute mentions across body sections so the keyword density reaches an ideal 1.0% to 2.0% range. Avoid robotic stuffing.
2. Semantic Entity & Topic Association:
   - Wisely relate "${effectiveKeyword}" to contextually relevant search terms, air quality science, health impacts, monitoring benchmarks, and prevention solutions.
3. Readability & Engagement:
   - Keep sentences clear, punchy, and readable (aim for 14-18 words per sentence, Grade 6-8 reading ease).
4. HTML Structure Integrity:
   - Strictly PRESERVE all existing HTML tags (<p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <img>, <table>, etc.) and all existing links and images. Only refine text nodes.

Respond ONLY with this raw JSON object (with "content" as the final property):
{
  "primaryKeyword": "${effectiveKeyword}",
  "optimizationsApplied": "Strategically placed '${effectiveKeyword}' in introduction, subheadings, and balanced body density to 1.2%.",
  "content": "<p>Full optimized HTML content here...</p>"
}`;
    } else if (action === 'fix_eeat_ymyl') {
      const effectiveKeyword = (primaryKeyword || '').trim() || (title || '').split(':')[0].trim() || 'indoor air quality';
      userPrompt = `Task: Upgrade this environmental health blog post to comply with Google's highest E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) and YMYL (Your Money or Your Life) standards, while resolving any keyword stuffing.

Article Title: "${title || ''}"
Primary Target Keyword: "${effectiveKeyword}"
Target Language: ${language}

Current HTML Content:
${content || ''}

Directives for Google E-E-A-T & YMYL Compliance:
1. Google E-E-A-T Scientific Attribution & Expertise:
   - Introduce verifiable scientific references and recognized benchmarks (e.g. World Health Organization [WHO] Air Quality Guidelines, EPA particulate pollution standards, or peer-reviewed environmental health studies).
   - Incorporate practical experience and empirical monitoring context (e.g. particle counter benchmarks in µg/m³, HEPA filtration air exchange rates, Prana Air laboratory insights).
2. Google YMYL Health Notice & Transparency:
   - Environmental and respiratory health falls under Google's YMYL (Your Money or Your Life) scope.
   - At the bottom of the article before the conclusion/footer, embed this professional informational disclaimer box:
     <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 1rem 1.25rem; margin-top: 2rem; margin-bottom: 1.5rem; border-radius: 6px; font-size: 0.85rem; color: #475569; line-height: 1.5;">
       <strong style="color: #1e3a8a;">Environmental Health &amp; Research Notice:</strong> This article is published by Prana Air for environmental awareness and educational purposes based on peer-reviewed environmental research and WHO/EPA benchmarks. It does not constitute medical diagnosis or individual treatment advice. Consult qualified healthcare professionals regarding respiratory or cardiovascular concerns.
     </div>
3. Eliminate Keyword Stuffing (Natural LSI Density):
   - Ensure the primary keyword "${effectiveKeyword}" is NOT stuffed. If repeated unnaturally, replace excess occurrences with natural LSI synonyms (e.g. "airborne synthetic microfibers", "respiratory particulate contaminants", "indoor micro-pollutants"). Keep keyword density in the optimal 0.8% to 1.8% sweet spot.
4. Structure Integrity:
   - Strictly PRESERVE all existing HTML tags, headings, lists, tables, links, and images. Only enrich text nodes with authoritative citations and embed the disclaimer.

Respond ONLY with this raw JSON object (with "content" as the final property):
{
  "primaryKeyword": "${effectiveKeyword}",
  "optimizationsApplied": "Integrated WHO/EPA scientific citations, eliminated keyword stuffing with LSI synonyms, and embedded Google YMYL health disclaimer.",
  "content": "<p>Full updated HTML content with E-E-A-T citations and YMYL disclaimer...</p>"
}`;
    } else if (action === 'fix_readability') {
      const effectiveKeyword = (primaryKeyword || '').trim();
      userPrompt = `Task: Improve readability and Flesch Reading Ease score of this blog post content to achieve Grade 6–8 level (Flesch score 65–75+), while wisely preserving and relating the primary target keyword${effectiveKeyword ? ` "${effectiveKeyword}"` : ''}.

Article Title: "${title || ''}"
${effectiveKeyword ? `Primary Target Keyword: "${effectiveKeyword}"` : ''}
Current HTML Content:
${content || ''}

Instructions:
1. Break up overly long, run-on, or academic sentences into clear, concise sentences (aim for 12 to 18 words per sentence).
2. Simplify complex phrasing or dense jargon without losing technical accuracy or key facts.
3. ${effectiveKeyword ? `Ensure "${effectiveKeyword}" is preserved and naturally present in introduction and body paragraphs.` : 'Ensure primary concepts remain clear.'}
4. CRITICAL: PRESERVE all existing HTML tags (<p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a>, <img>, <table>, etc.) and all existing structure. Only rewrite sentence structures inside text nodes.

Respond ONLY with this raw JSON object:
{
  "content": "<p>Full improved HTML content with simplified sentences...</p>",
  "readabilitySummary": "Broken down complex sentences to an average of 14-16 words per sentence."
}`;
    } else {
      // 'fix_all': Comprehensive optimization of SERP metadata AND main blog body content
      const hasConflict = !!conflict;
      const avoidTerms = Array.isArray(overlappingKeywords) && overlappingKeywords.length > 0
        ? overlappingKeywords.join(', ')
        : (conflict?.matchingKeywords || []).join(', ');
      const effectiveKeyword = (primaryKeyword || '').trim() || (title || '').split(':')[0].trim() || 'indoor air quality';

      userPrompt = `Task: Perform a comprehensive end-to-end SEO overhaul for this blog post. You will optimize the SERP metadata AND update the main body content with the primary target keyword wisely integrated.

Current Title: "${title || ''}"
Current Slug: "${slug || ''}"
Current Description: "${description || ''}"
Primary Target Keyword: "${effectiveKeyword}"
Target Language: ${language}
${hasConflict ? `
CANNIBALIZATION CONFLICT:
Competing Published Article: "${conflict.title}" (${conflict.url})
Shared Keywords TO AVOID: [${avoidTerms || 'home, your home'}]
Must differentiate title and slug to avoid [${avoidTerms}].
` : ''}

Current HTML Content:
${content || ''}

Requirements:
1. "primaryKeyword": Best 2-4 word target keyword (e.g. "${effectiveKeyword}").
2. "title": High-CTR, authoritative title strictly between 45 and 60 characters containing the primary keyword near the beginning. ${hasConflict ? `Must avoid [${avoidTerms}].` : ''}
3. "slug": Clean, lowercase, hyphenated URL slug under 50 characters containing the primary keyword. ${hasConflict ? `Must avoid [${avoidTerms}].` : ''}
4. "description": Compelling Google search snippet strictly between 125 and 155 characters naturally including the primary keyword with an active call to action.
5. "content": The full updated HTML article body where:
   - "${effectiveKeyword}" is wisely placed in the opening 100-150 words of the introduction.
   - "${effectiveKeyword}" (or natural semantic variations) is woven into at least 1-2 subheadings (<h2> or <h3>).
   - "${effectiveKeyword}" is naturally distributed across body sections at an optimal 1.0%–1.8% density.
   - Long, academic sentences are broken down into clear Grade 7-8 readable sentences.
   - ALL existing HTML structure, headings, lists, tables, links, and images are strictly preserved.
${hasConflict ? '6. "differentiatedAngle": 1 sentence explaining the new unique search angle.' : ''}

Respond ONLY with this raw JSON object (with "content" as the final property):
{
  "primaryKeyword": "${effectiveKeyword}",
  "title": "Optimized Title (45-60c)",
  "slug": "optimized-slug",
  "description": "Optimized meta description (125-155c)"${hasConflict ? ',\n  "differentiatedAngle": "Unique angle applied."' : ''},
  "content": "<p>Full updated HTML content with primary keyword and readable sentences...</p>"
}`;
    }

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: ['fix_all', 'optimize_content', 'fix_content_keyword', 'fix_readability', 'fix_eeat_ymyl'].includes(action) ? 8000 : 2000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const rawText = response.content[0]?.text || '';

    function safeExtractJson(raw) {
      if (!raw) return null;

      // 1. Strip markdown code fences
      let text = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      // 2. Direct parse attempt
      try {
        return JSON.parse(text);
      } catch (_) {}

      // 3. Extract between first { and last }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = text.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch (_) {}

        // 4. Try sanitizing newlines inside string values
        try {
          const sanitized = candidate.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
            return match.replace(/\r?\n/g, ' ');
          });
          return JSON.parse(sanitized);
        } catch (_) {}
      }

      // 5. Fallback regex extraction for known fields
      const extractField = (fieldName) => {
        const regexClosed = new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`, 'i');
        const matchClosed = text.match(regexClosed);
        if (matchClosed && matchClosed[1]) {
          return matchClosed[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        }
        const regexOpen = new RegExp(`"${fieldName}"\\s*:\\s*"([^"\\r\\n]+)`, 'i');
        const matchOpen = text.match(regexOpen);
        if (matchOpen && matchOpen[1]) {
          return matchOpen[1].replace(/\\"/g, '"').trim();
        }
        return null;
      };

      const title = extractField('title');
      const slug = extractField('slug');
      const description = extractField('description');
      const primaryKeyword = extractField('primaryKeyword');
      const differentiatedAngle = extractField('differentiatedAngle');
      const searchIntent = extractField('searchIntent');
      const rationale = extractField('rationale');

      let content = null;
      const contentStartIdx = text.indexOf('"content":');
      if (contentStartIdx !== -1) {
        const quoteStart = text.indexOf('"', contentStartIdx + 10);
        if (quoteStart !== -1) {
          const nextFieldMatch = text.slice(quoteStart + 1).search(/"\s*,\s*"[a-zA-Z0-9_-]+"\s*:/);
          if (nextFieldMatch !== -1) {
            content = text.slice(quoteStart + 1, quoteStart + 1 + nextFieldMatch);
          } else {
            const lastBrace = text.lastIndexOf('}');
            if (lastBrace > quoteStart) {
              const quoteEnd = text.lastIndexOf('"', lastBrace);
              if (quoteEnd > quoteStart) {
                content = text.slice(quoteStart + 1, quoteEnd);
              }
            }
          }
        }
      }
      if (!content) {
        const contentMatch = text.match(/"content"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"[a-zA-Z0-9_-]+"\s*:|"\s*\}|$)/i);
        if (contentMatch && contentMatch[1]) {
          content = contentMatch[1];
        }
      }
      if (content) {
        content = content.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
      }

      if (title || slug || description || primaryKeyword || differentiatedAngle || content || searchIntent) {
        return {
          ...(title ? { title } : {}),
          ...(slug ? { slug } : {}),
          ...(description ? { description } : {}),
          ...(primaryKeyword ? { primaryKeyword } : {}),
          ...(differentiatedAngle ? { differentiatedAngle } : {}),
          ...(content ? { content } : {}),
          ...(searchIntent ? { searchIntent } : {}),
          ...(rationale ? { rationale } : {})
        };
      }

      return null;
    }

    const parsed = safeExtractJson(rawText);

    if (!parsed) {
      throw new Error('Claude returned an invalid response structure. Please try again.');
    }

    return NextResponse.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI Fix SEO Error]:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate AI SEO optimization.'
    }, { status: 500 });
  }
}

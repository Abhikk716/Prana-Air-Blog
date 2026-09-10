import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/adminAuth';
import Anthropic from '@anthropic-ai/sdk';

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
      needsReadabilityFix = false
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
      model: 'claude-haiku-4-5-20251001',
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

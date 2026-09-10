// On-page SEO + readability audit shared by the editor (live score panel
// and Auto-Fix All), the dashboard (score columns) and the backfill script.
// Plain CommonJS with no React/DOM dependencies so Node scripts can require
// it and both server and client components can import it.

// Counts syllables in a word for Flesch Reading Ease and Grade Level
function countSyllables(word) {
  if (!word) return 1;
  word = word.toLowerCase().trim();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// Stop words list for search query keyword extraction
const CANNIBALIZATION_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'about', 'what',
  'how', 'why', 'can', 'are', 'was', 'were', 'our', 'best', 'top', 'into', 'over',
  'more', 'than', 'under', 'will', 'when', 'which', 'where', 'look', 'closer',
  'secretly', 'quiet', 'ultimate', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'by', 'is',
  'it', 'its', 'you', 'all', 'any', 'not', 'or', 'be', 'as', 'do', 'does', 'did', 'have',
  'has', 'had', 'guide', 'tips', 'lessons', 'behind', 'routine', 'ranking', 'rankings',
  'world', 'worlds', 'closer', 'technology'
]);

function extractTopicalKeywords(str) {
  if (!str) return { words: [], phrases: [] };
  const clean = str
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9\.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = clean.split(/[\s\-_]+/).filter(t => t.length >= 2);
  const words = tokens.filter(t => t.length >= 3 && !CANNIBALIZATION_STOP_WORDS.has(t));

  const phrases = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const t1 = tokens[i];
    const t2 = tokens[i + 1];
    if (t1.length >= 3 && t2.length >= 3 && (!CANNIBALIZATION_STOP_WORDS.has(t1) || !CANNIBALIZATION_STOP_WORDS.has(t2))) {
      phrases.push(`${t1} ${t2}`);
    }
  }

  return { words: Array.from(new Set(words)), phrases: Array.from(new Set(phrases)) };
}

// Computes real-time SEO score, Flesch Reading Ease score, Grade Level, and actionable checklist
function analyzeReadabilityAndSeo({
  title = '',
  slug = '',
  description = '',
  content = '',
  featuredImage = '',
  featuredImageAlt = '',
  existingPosts = [],
  currentPostId = null,
  canonicalUrl = '',
  canonicalMode = 'self',
  primaryKeyword = ''
}) {
  const textWithSentenceBreaks = (content || '')
    .replace(/<\/(p|h[1-6]|li|div|tr|blockquote)>/gi, '. ')
    .replace(/<br\s*\/?>/gi, '. ');
  const plainText = textWithSentenceBreaks.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plainText.length > 0 ? plainText.split(/\s+/).filter(w => w.length > 0) : [];
  const wordCount = words.length;

  const sentences = plainText.length > 0 ? plainText.split(/[.!?]+/).filter(s => s.trim().length > 1) : [];
  const sentenceCount = Math.max(1, sentences.length);

  let totalSyllables = 0;
  let complexWordCount = 0;
  for (const w of words) {
    const syl = countSyllables(w);
    totalSyllables += syl;
    if (syl >= 3) complexWordCount++;
  }

  // Flesch Reading Ease: 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
  let fleschScore = 100;
  let gradeLevel = 5.0;
  let wordsPerSentence = 12;
  let complexWordPct = 0;
  const longSentences = sentences.filter(s => s.trim().split(/\s+/).length > 22);

  if (wordCount > 10) {
    wordsPerSentence = Math.round((wordCount / sentenceCount) * 10) / 10;
    const syllablesPerWord = totalSyllables / Math.max(1, wordCount);
    complexWordPct = Math.round((complexWordCount / wordCount) * 100);
    const flesch = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * syllablesPerWord);
    fleschScore = Math.max(0, Math.min(100, Math.round(flesch)));

    // Flesch-Kincaid Grade Level: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
    const fkGrade = (0.39 * (wordCount / sentenceCount)) + (11.8 * syllablesPerWord) - 15.59;
    gradeLevel = Math.max(1, Math.min(16, Math.round(fkGrade * 10) / 10));
  }

  let readabilityStatus = 'Good';
  let readabilityColor = '#16a34a';
  let readabilityLabel = 'Easy to Read';
  if (fleschScore < 50) {
    readabilityStatus = 'Difficult';
    readabilityColor = '#ef4444';
    readabilityLabel = 'Difficult / Academic';
  } else if (fleschScore < 65) {
    readabilityStatus = 'Moderate';
    readabilityColor = '#f59e0b';
    readabilityLabel = 'Fairly Standard';
  } else {
    readabilityStatus = 'Good';
    readabilityColor = '#16a34a';
    readabilityLabel = 'Plain English (Optimal)';
  }

  let seoScore = 0;
  const issues = [];
  const passed = [];

  // 1. Title Length Check
  const titleLen = (title || '').trim().length;
  if (titleLen === 0) {
    issues.push({
      type: 'error',
      code: 'title_missing',
      title: 'Missing Post Title',
      issue: 'The post has no title defined.',
      solution: 'Add a clear, keyword-rich title between 40 and 60 characters.'
    });
  } else if (titleLen < 35) {
    seoScore += 10;
    issues.push({
      type: 'warning',
      code: 'title_short',
      title: 'Title is too short',
      issue: `Title is only ${titleLen} characters (under 35 chars).`,
      solution: 'Expand title to 40–60 characters to capture higher search intent.'
    });
  } else if (titleLen > 65) {
    seoScore += 12;
    issues.push({
      type: 'warning',
      code: 'title_long',
      title: 'Title will be truncated by Google',
      issue: `Title is ${titleLen} characters (over 60 chars).`,
      solution: 'Trim title to 60 characters or fewer so the full title displays without truncation.'
    });
  } else {
    seoScore += 25;
    passed.push({
      title: 'SEO Title Length',
      detail: `Optimal length (${titleLen} characters) within recommended 40–60 characters.`
    });
  }

  // 2. Meta Description / Excerpt Check
  const descLen = (description || '').trim().length;
  if (descLen === 0) {
    issues.push({
      type: 'error',
      code: 'desc_missing',
      title: 'Missing Meta Description & Excerpt',
      issue: 'No meta description or excerpt provided.',
      solution: 'Write a compelling summary between 120 and 160 characters.'
    });
  } else if (descLen < 100) {
    seoScore += 10;
    issues.push({
      type: 'warning',
      code: 'desc_short',
      title: 'Description is too short',
      issue: `Description is only ${descLen} characters (ideal: 120–160 chars).`,
      solution: 'Add more descriptive details to reach at least 120 characters.'
    });
  } else if (descLen > 165) {
    seoScore += 12;
    issues.push({
      type: 'warning',
      code: 'desc_long',
      title: 'Description is too long',
      issue: `Description is ${descLen} characters (over 160 chars).`,
      solution: 'Shorten description to under 160 characters so Google does not cut it off with an ellipsis.'
    });
  } else {
    seoScore += 25;
    passed.push({
      title: 'Meta Description & Excerpt Length',
      detail: `Optimal length (${descLen} characters) within 120–160 characters.`
    });
  }

  // 3. Slug check
  if (!slug || slug.trim().length === 0) {
    issues.push({
      type: 'error',
      code: 'slug_missing',
      title: 'Missing URL Slug',
      issue: 'No URL slug generated for this post.',
      solution: 'Provide a lowercase, hyphen-separated slug.'
    });
  } else if (slug.length > 75) {
    seoScore += 5;
    issues.push({
      type: 'warning',
      code: 'slug_long',
      title: 'URL Slug is too long',
      issue: `Slug has ${slug.length} characters (over 75 chars).`,
      solution: 'Keep slug concise and focused on primary target keywords.'
    });
  } else {
    seoScore += 15;
    passed.push({
      title: 'URL Slug Structure',
      detail: 'Clean, lowercase, and search-engine friendly.'
    });
  }

  // 4. Content Word Count
  if (wordCount < 300) {
    seoScore += Math.round((wordCount / 300) * 8);
    issues.push({
      type: 'warning',
      code: 'word_count',
      title: 'Low Word Count',
      issue: `Article has ${wordCount} words (recommended: 600+ words).`,
      solution: 'Add in-depth analysis, FAQs, and explanations to build topical authority.'
    });
  } else if (wordCount < 600) {
    seoScore += 14;
    passed.push({
      title: 'Acceptable Word Count',
      detail: `${wordCount} words. Consider expanding for competitive search terms.`
    });
  } else {
    seoScore += 20;
    passed.push({
      title: 'Comprehensive Content Depth',
      detail: `Great depth with ${wordCount} words, satisfying search depth.`
    });
  }

  // 5. Headings structure
  const hasH2 = /<h2[^>]*>/i.test(content || '');
  const hasH3 = /<h3[^>]*>/i.test(content || '');
  if (!hasH2 && wordCount > 200) {
    issues.push({
      type: 'warning',
      code: 'no_h2',
      title: 'Missing H2 Subheadings',
      issue: 'No H2 subheadings found in article body.',
      solution: 'Break content into clear sections using H2 headings for readability and ranking.'
    });
  } else if (hasH2) {
    seoScore += 10;
    passed.push({
      title: 'Heading Hierarchy',
      detail: `Content uses H2 ${hasH3 ? 'and H3 ' : ''}headings to organize thoughts.`
    });
  }

  // 6. Featured Image & Alt
  if (!featuredImage) {
    issues.push({
      type: 'warning',
      code: 'no_featured_image',
      title: 'Missing Featured Media',
      issue: 'No featured image selected for article thumbnail.',
      solution: 'Upload a high-resolution hero image with descriptive alt text.'
    });
  } else {
    seoScore += 5;
    passed.push({
      title: 'Featured Image Set',
      detail: 'Hero image ready for SERP rich snippet and social cards.'
    });
  }

  // 7. Keyword Cannibalization Detection (Checked against published articles)
  const currKeywords = extractTopicalKeywords((title || '') + ' ' + (slug || ''));
  if (currKeywords.words.length >= 2 && Array.isArray(existingPosts) && existingPosts.length > 0) {
    const conflicts = [];

    for (const post of existingPosts) {
      // Skip self
      if (currentPostId && (post._id === currentPostId || post.id === currentPostId)) continue;
      if (currentPostId && post.slug && slug && post.slug === slug) continue;

      const otherKeywords = extractTopicalKeywords((post.title || '') + ' ' + (post.slug || ''));
      const matchingWords = currKeywords.words.filter(w => otherKeywords.words.includes(w));
      const matchingPhrases = currKeywords.phrases.filter(p => otherKeywords.phrases.includes(p));

      const matchWeight = matchingWords.length + (matchingPhrases.length * 1.6);
      const minTerms = Math.max(1, Math.min(currKeywords.words.length, otherKeywords.words.length));
      const overlapPercent = Math.min(95, Math.round((matchWeight / (minTerms + (matchingPhrases.length > 0 ? 1 : 0))) * 100));

      if (overlapPercent >= 45 || (matchingPhrases.length >= 1 && matchingWords.length >= 2) || matchingWords.length >= 3) {
        conflicts.push({
          id: post._id || post.id,
          title: post.title,
          slug: post.slug,
          url: `https://www.pranaair.com/blog/${post.slug}`,
          matchingKeywords: Array.from(new Set([...matchingPhrases, ...matchingWords])),
          overlapScore: Math.max(48, overlapPercent)
        });
      }
    }

    if (conflicts.length > 0) {
      conflicts.sort((a, b) => b.overlapScore - a.overlapScore);
      const topConflict = conflicts[0];
      const isHighRisk = topConflict.overlapScore >= 68;

      // If user directed rel="canonical" to the master conflicting article, conflict is resolved per Google guidelines!
      const isCanonicalizedToMaster = canonicalMode === 'custom' && canonicalUrl && (
        canonicalUrl.trim().toLowerCase() === topConflict.url.toLowerCase() ||
        canonicalUrl.trim().toLowerCase().includes(topConflict.slug.toLowerCase())
      );

      if (isCanonicalizedToMaster) {
        seoScore += 10;
        passed.push({
          title: 'Cannibalization Resolved via Canonical Tag',
          detail: `Rel="canonical" directed to master article "${topConflict.title}". Google will attribute ranking signals to the primary URL.`
        });
      } else {
        seoScore = Math.max(0, seoScore - (isHighRisk ? 15 : 8));

        issues.push({
          type: isHighRisk ? 'error' : 'warning',
          code: 'cannibalization',
          title: `Keyword Cannibalization Detected (${topConflict.overlapScore}% overlap)`,
          isCannibalization: true,
          cannibalization: {
            primaryConflict: topConflict,
            allConflicts: conflicts,
            overlappingKeywords: topConflict.matchingKeywords,
            targetQuery: topConflict.matchingKeywords.slice(0, 3).join(' + ')
          },
          issue: `Direct query overlap on [${topConflict.matchingKeywords.slice(0, 3).join(', ')}] with existing published post: "${topConflict.title}".`,
          proof: {
            currentQuery: title || slug,
            conflictingTitle: topConflict.title,
            conflictingUrl: topConflict.url,
            overlappingTerms: topConflict.matchingKeywords,
            overlapPercent: topConflict.overlapScore,
            riskAnalysis: `Both articles target search intent around "${topConflict.matchingKeywords.join(' ')}". Google will split crawl priority, backlinks, and CTR between both articles.`
          },
          solution: `Differentiate search intent with long-tail angles, set a Canonical Tag pointing to "${topConflict.title}", or merge into the existing URL.`
        });
      }
    } else {
      seoScore += 10;
      passed.push({
        title: 'Zero Keyword Cannibalization (Topical Exclusivity)',
        detail: `Verified against ${existingPosts.length} published articles. No competing titles, slugs, or shared search queries detected for "${currKeywords.words.slice(0, 4).join(', ')}".`
      });
    }
  }

  // 8. Canonical Tag Validation
  const effectiveCanonical = canonicalMode === 'custom' && canonicalUrl.trim()
    ? canonicalUrl.trim()
    : `https://www.pranaair.com/blog/${slug || 'post-slug'}`;

  if (canonicalMode === 'custom') {
    if (!canonicalUrl.trim()) {
      issues.push({
        type: 'warning',
        code: 'canonical_empty',
        title: 'Empty Custom Canonical URL',
        issue: 'Custom canonical mode is enabled but no target URL is specified.',
        solution: 'Provide a fully qualified URL (e.g. https://www.pranaair.com/blog/master-article) or switch back to Self-Referential.'
      });
    } else if (!/^https?:\/\//i.test(canonicalUrl.trim())) {
      issues.push({
        type: 'warning',
        code: 'canonical_invalid',
        title: 'Invalid Canonical URL Format',
        issue: `Canonical URL "${canonicalUrl}" is missing https:// protocol.`,
        solution: 'Use a complete absolute URL beginning with https://.'
      });
    } else {
      seoScore += 5;
      passed.push({
        title: 'Custom Canonical Tag Active',
        detail: `Consolidating indexing signals to master URL: ${canonicalUrl.trim()}`
      });
    }
  } else {
    seoScore += 5;
    passed.push({
      title: 'Valid Self-Referential Canonical Tag',
      detail: `Default rel="canonical" tag correctly points to this post (${effectiveCanonical}).`
    });
  }

  // Readability checks with detailed diagnostic metrics
  if (wordCount > 30) {
    if (fleschScore < 55) {
      issues.push({
        type: 'warning',
        code: 'readability',
        title: 'Complex Reading Level',
        issue: `Readability score is ${fleschScore}/100 (Grade ${gradeLevel} - Difficult/Academic). Most online readers disengage on content above Grade 8.`,
        solution: 'Aim for Grade 7–8 level (Flesch 65–75+). Break down sentences into 12–16 words and replace dense academic jargon with conversational English.'
      });
    }

    if (wordsPerSentence > 18 || longSentences.length > 3) {
      issues.push({
        type: 'warning',
        code: 'sentence_length',
        title: 'Average Sentence Length Too High',
        issue: `Average sentence length is ${wordsPerSentence} words (optimal is 12–16 words). Found ${longSentences.length} sentences exceeding 22 words.`,
        solution: 'Split compound sentences joined by "and", "which", "because", or semicolons into 2 shorter, punchy sentences.'
      });
    }

    if (complexWordPct > 15) {
      issues.push({
        type: 'warning',
        code: 'jargon',
        title: 'High Jargon & Multi-Syllable Density',
        issue: `${complexWordPct}% of words contain 3 or more syllables, increasing cognitive reading friction.`,
        solution: 'Substitute complex multi-syllable terms with direct plain English equivalents (e.g. "accumulate" → "build up", "concentrations" → "levels", "utilize" → "use").'
      });
    }

    if (fleschScore >= 55 && wordsPerSentence <= 18 && complexWordPct <= 15) {
      passed.push({
        title: 'Content Readability & Sentence Flow',
        detail: `Flesch Reading Ease ${fleschScore}/100 (Grade ${gradeLevel}), avg ${wordsPerSentence} words/sentence, accessible to general readers.`
      });
    }
  }

  // 9. Primary Target Keyword Evaluation & SEO Score Impact
  const cleanKw = (primaryKeyword || '').trim().toLowerCase();
  let keywordInTitle = false;
  let keywordInSlug = false;
  let keywordInDesc = false;
  let keywordMatches = 0;
  let keywordDensity = 0;

  if (cleanKw) {
    const titleLower = (title || '').toLowerCase();
    const descLower = (description || '').toLowerCase();
    const slugLower = (slug || '').toLowerCase();
    const slugKw = cleanKw.replace(/\s+/g, '-');

    // A. Check Keyword in SEO Title (up to 12 pts)
    keywordInTitle = titleLower.includes(cleanKw);
    if (keywordInTitle) {
      const isFrontLoaded = titleLower.indexOf(cleanKw) < 25;
      seoScore += isFrontLoaded ? 12 : 8;
      passed.push({
        title: 'Target Keyword in Title',
        detail: `Primary keyword "${primaryKeyword}" found in SEO Title${isFrontLoaded ? ' (front-loaded)' : ''}.`
      });
    } else {
      issues.push({
        type: 'warning',
        code: 'kw_title',
        title: 'Target Keyword Missing from Title',
        issue: `Target keyword "${primaryKeyword}" was not found in the SEO Title.`,
        solution: `Place "${primaryKeyword}" near the beginning of your SEO title.`
      });
    }

    // B. Check Keyword in URL Slug (up to 8 pts)
    const kwWords = cleanKw.split(/\s+/).filter(w => w.length > 2);
    keywordInSlug = slugLower.includes(slugKw) || (kwWords.length > 0 && kwWords.every(w => slugLower.includes(w)));
    if (keywordInSlug) {
      seoScore += 8;
      passed.push({
        title: 'Target Keyword in URL Slug',
        detail: `URL slug contains "${primaryKeyword}".`
      });
    } else {
      issues.push({
        type: 'warning',
        code: 'kw_slug',
        title: 'Target Keyword Missing from Slug',
        issue: `Target keyword "${primaryKeyword}" is missing from the URL slug.`,
        solution: `Include "${slugKw}" in the slug for stronger keyword relevance.`
      });
    }

    // C. Check Keyword in Meta Description (up to 8 pts)
    keywordInDesc = descLower.includes(cleanKw);
    if (keywordInDesc) {
      seoScore += 8;
      passed.push({
        title: 'Target Keyword in Meta Description',
        detail: `Primary keyword "${primaryKeyword}" appears in the search snippet.`
      });
    } else {
      issues.push({
        type: 'warning',
        code: 'kw_desc',
        title: 'Target Keyword Missing from Description',
        issue: `Target keyword "${primaryKeyword}" is missing from the meta description.`,
        solution: `Include "${primaryKeyword}" naturally in your meta description snippet.`
      });
    }

    // D. Check Keyword Density in Content Body (up to 8 pts)
    try {
      const kwRegex = new RegExp('\\b' + cleanKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = plainText.match(kwRegex) || [];
      keywordMatches = matches.length;
      keywordDensity = wordCount > 0 ? Math.round((keywordMatches / wordCount) * 1000) / 10 : 0;
    } catch {
      keywordMatches = 0;
      keywordDensity = 0;
    }

    if (keywordMatches === 0 && wordCount > 50) {
      issues.push({
        type: 'warning',
        code: 'kw_body',
        title: 'Target Keyword Missing from Article Body',
        issue: `Target keyword "${primaryKeyword}" does not appear anywhere in the article text.`,
        solution: `Mention "${primaryKeyword}" naturally in your article body and introduction.`
      });
    } else if (keywordDensity > 2.3) {
      issues.push({
        type: 'error',
        code: 'kw_stuffing',
        title: 'Keyword Stuffing Detected (Over-Optimization)',
        issue: `Keyword density is ${keywordDensity}% (${keywordMatches} times). Google algorithms flag repetition above 2.2% as unnatural keyword stuffing.`,
        solution: 'Replace repetitive keyword occurrences with Latent Semantic Indexing (LSI) synonyms (e.g. synthetic fibers, airborne plastic particulate). Aim for 0.8%–1.8% density.'
      });
    } else if (wordCount > 50) {
      seoScore += 8;
      passed.push({
        title: 'Optimal Keyword Density (No Stuffing)',
        detail: `Found ${keywordMatches} times (${keywordDensity}% density, ideal range 0.4%–2.0%).`
      });
    }
  } else {
    issues.push({
      type: 'warning',
      code: 'no_keyword',
      title: 'No Target Keyword Defined',
      issue: 'No primary target keyword has been set for this article.',
      solution: 'Specify a primary target keyword above or click "✨ AI Suggest" to benchmark on-page SEO targeting.'
    });
  }

  // 10. Google E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)
  const eeatPatterns = [
    /\b(WHO|World Health Organization)\b/i,
    /\b(EPA|Environmental Protection Agency)\b/i,
    /\b(CDC|NIH|PubMed|Lancet|Nature|ScienceDirect|UNEP)\b/i,
    /\b(peer-reviewed|journal|study published|clinical trial|researchers at)\b/i,
    /https?:\/\/[^\s"']+\.(gov|edu|org|who\.int|nih\.gov|epa\.gov)/i
  ];
  const matchedEeat = eeatPatterns.filter(p => p.test(content || ''));
  const hasEeatCitations = matchedEeat.length >= 1;

  if (wordCount > 150) {
    if (hasEeatCitations) {
      seoScore += 6;
      passed.push({
        title: 'Google E-E-A-T Scientific Attribution',
        detail: 'Content references recognized scientific research or environmental health institutions, reinforcing Google E-E-A-T trust signals.'
      });
    } else {
      issues.push({
        type: 'warning',
        code: 'eeat',
        title: 'E-E-A-T Gap: Missing Scientific Citations',
        issue: 'Article discusses environmental & air quality claims without citing authoritative research or standards (e.g., WHO, EPA, Lancet, or peer-reviewed studies).',
        solution: 'Cite peer-reviewed studies, official WHO/EPA air quality thresholds, or institutional measurements to strengthen Google E-E-A-T.'
      });
    }
  }

  // 11. Google YMYL (Your Money or Your Life) Health & Safety Compliance
  const ymylHealthPattern = /\b(health|respiratory|lungs?|cancer|blood|toxic(ity)?|cardiovascular|disease|asthma|inhalation|pulmonary|tissue)\b/i;
  const discussesHealth = ymylHealthPattern.test(plainText);
  const disclaimerPattern = /\b(disclaimer|educational purposes|consult a (doctor|physician|medical|healthcare)|not (intended as|a substitute for) medical advice)\b/i;
  const hasYmylDisclaimer = disclaimerPattern.test(plainText);

  if (discussesHealth && wordCount > 200) {
    if (hasYmylDisclaimer) {
      seoScore += 6;
      passed.push({
        title: 'Google YMYL Health Disclaimer Present',
        detail: 'Includes a clear educational & informational disclaimer for environmental health topics, complying with Google YMYL quality standards.'
      });
    } else {
      issues.push({
        type: 'warning',
        code: 'ymyl',
        title: 'YMYL Compliance: Health & Medical Disclaimer Missing',
        issue: 'Content discusses health, pulmonary, or toxicity impacts. Google YMYL guidelines require clear disclaimers stating content is for educational purposes and not clinical medical advice.',
        solution: 'Add an informational/health disclaimer box at the bottom of the article to meet Google YMYL criteria.'
      });
    }
  }

  seoScore = Math.min(100, Math.max(0, Math.round(seoScore)));

  let seoColor = '#ef4444';
  let seoStatus = 'Poor';
  if (seoScore >= 80) {
    seoColor = '#16a34a';
    seoStatus = 'Good';
  } else if (seoScore >= 50) {
    seoColor = '#f59e0b';
    seoStatus = 'Needs Work';
  }

  return {
    seoScore,
    seoColor,
    seoStatus,
    fleschScore,
    gradeLevel,
    readabilityStatus,
    readabilityColor,
    readabilityLabel,
    wordCount,
    sentenceCount,
    issues,
    passed,
    keywordInTitle,
    keywordInSlug,
    keywordInDesc,
    keywordMatches,
    keywordDensity,
    primaryKeyword
  };
}

// Maps a Post document (or lean object) to the fields stored under
// `seo.*` for the dashboard. `existingPosts` (id/title/slug of every other
// post) enables the cannibalization check; pass [] to skip it.
function scorePost(post, existingPosts = []) {
  const seo = post.seo || {};
  const metrics = analyzeReadabilityAndSeo({
    title: seo.title || post.title || '',
    slug: post.slug || '',
    description: seo.description || post.excerpt || '',
    content: post.content || '',
    featuredImage: post.featuredImage || '',
    featuredImageAlt: post.featuredImageAlt || '',
    existingPosts,
    currentPostId: String(post._id || ''),
    canonicalUrl: seo.canonicalUrl || '',
    canonicalMode: seo.canonicalUrl ? 'custom' : 'self',
    primaryKeyword: seo.primaryKeyword || ''
  });
  return {
    score: metrics.seoScore,
    readability: metrics.fleschScore,
    grade: metrics.gradeLevel,
    wordCount: metrics.wordCount,
    issueCount: metrics.issues.length
  };
}

// Recomputes and stores seo.score/readability/grade for one post document
// after any create/update, so the dashboard never shows a stale score no
// matter which route changed the post (full editor save, alt-text-only
// save, ...). Uses the other posts' titles/slugs for the cannibalization
// check. Does not bump updatedAt — it's part of the same save.
async function refreshStoredScores(PostModel, post) {
  if (!post || !post._id) return null;
  const others = await PostModel.find({ _id: { $ne: post._id } }, '_id title slug').lean();
  const existing = others.map(p => ({ _id: String(p._id), title: p.title, slug: p.slug }));
  const plain = typeof post.toObject === 'function' ? post.toObject() : post;
  const scores = scorePost(plain, existing);
  await PostModel.updateOne(
    { _id: post._id },
    { $set: { 'seo.score': scores.score, 'seo.readability': scores.readability, 'seo.grade': scores.grade, 'seo.scoredAt': new Date() } },
    { timestamps: false }
  );
  return scores;
}

module.exports = {
  countSyllables,
  extractTopicalKeywords,
  analyzeReadabilityAndSeo,
  scorePost,
  refreshStoredScores
};

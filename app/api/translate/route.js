import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../lib/adminAuth';
import { extractTextSegments, injectTextSegments } from '../../../lib/htmlSegments';
import Anthropic from '@anthropic-ai/sdk';

// Rough chars-per-token estimate used only to size max_tokens (not for
// billing — that's based on actual tokens generated, so it costs nothing to
// size this generously). Non-Latin scripts (Cyrillic, Japanese, etc.) come
// out more token-dense than the English source used for this estimate, so
// the divisor and buffer below are deliberately conservative.
const estimateTokens = (str) => Math.ceil((str || '').length / 2.2);

const LANG_NAMES = {
  hi: 'Hindi', es: 'Spanish', de: 'German', fr: 'French', ru: 'Russian', ja: 'Japanese', 'pt-PT': 'Portuguese'
};

// Long articles need many text snippets translated per call. That used to
// go through the tool schema as content_segments: array-of-strings, but the
// model would sometimes hand that array back as a single JSON-stringified
// string instead of a real array — injectTextSegments then indexed into
// that string char-by-char, silently writing one character into each
// heading/paragraph instead of the translated text. Shrinking the chunk
// size cut how *often* this happened but never to zero (still hit on one
// small German chunk, and 4 same-prompt retries at low temperature aren't
// independent enough to reliably escape it once a chunk is prone to it).
// So the array is gone: the model instead returns ONE string with segments
// joined by SEGMENT_DELIMITER, which sidesteps the array/string ambiguity
// entirely — there's no array-shaped value to accidentally serialize into
// a string. Chunking (below) is kept only to bound how much text goes
// through a single call, not to work around this bug.
const CHARS_PER_CALL = 3000;
const SEGMENT_DELIMITER = '@@SEG@@';

const translationTool = {
  name: 'provide_translation',
  description: 'Submit the translated blog post fields.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      excerpt: { type: 'string' },
      content_blob: {
        type: 'string',
        description: `All translated content segments, in the same order as the input, joined into one string using the exact literal separator "${SEGMENT_DELIMITER}" between each segment (not before the first or after the last).`
      }
    },
    required: ['title', 'excerpt', 'content_blob']
  }
};

// Groups segments into chunks so each chunk's own text stays under
// `charBudget` characters — a single very long segment still gets its own
// (oversized) chunk rather than being split mid-sentence.
function chunkByCharBudget(items, charBudget) {
  const chunks = [];
  let current = [];
  let currentLen = 0;
  for (const item of items) {
    const len = item.length;
    if (current.length > 0 && currentLen + len > charBudget) {
      chunks.push(current);
      current = [];
      currentLen = 0;
    }
    current.push(item);
    currentLen += len;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length ? chunks : [[]];
}

// Splits the delimiter-joined blob back into segments and rejects (returns
// null) anything that doesn't split into exactly the expected count, so a
// bad generation is retried rather than saved as corrupted/misaligned
// content.
function normalizeContentSegments(contentBlob, expectedLength) {
  if (typeof contentBlob !== 'string') return null;
  const segments = contentBlob.split(SEGMENT_DELIMITER);
  if (segments.length !== expectedLength) return null;
  return segments;
}

async function translateChunk({ anthropic, langName, title, excerpt, chunkSegments, includeTitleExcerpt }) {
  const numberedList = chunkSegments.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const prompt = `You are an expert translator. Translate the following ${chunkSegments.length} numbered text snippets into ${langName}, then call the provide_translation tool with the result.

RULES:
1. Translate every snippet below. Keep them in the exact same order — never merge, split, drop, or reorder any of the ${chunkSegments.length} items. If a snippet is not translatable (e.g. a number or symbol), return it unchanged.
2. In "content_blob", output the ${chunkSegments.length} translated snippets joined by the literal separator "${SEGMENT_DELIMITER}" — one snippet, then "${SEGMENT_DELIMITER}", then the next snippet, and so on. Do not include the numbering, and do not put a separator before the first snippet or after the last one.
3. Preserve any quotation marks, quoted speech, or punctuation that appears in the source text.
${includeTitleExcerpt ? '' : '4. This is a mid-article continuation, not the start of the post — set "title" and "excerpt" to empty strings.'}

${includeTitleExcerpt ? `TITLE: ${title || ''}\n\nEXCERPT: ${excerpt || ''}\n\n` : ''}SNIPPETS:
${numberedList}`;

  const estimatedOutputTokens = Math.ceil(
    (estimateTokens(title) + estimateTokens(excerpt) + estimateTokens(numberedList)) * 2.5
  );
  const maxTokens = Math.min(64000, Math.max(4000, estimatedOutputTokens));

  let lastError = 'came back malformed.';
  for (let attempt = 0; attempt < 4; attempt++) {
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      // Nudge temperature up on retries — a same-prompt retry at a fixed
      // low temperature can reproduce the same malformed output rather
      // than a fresh, correctly-shaped one.
      temperature: Math.min(0.1 + attempt * 0.2, 0.7),
      tools: [translationTool],
      tool_choice: { type: 'tool', name: 'provide_translation' },
      messages: [{ role: 'user', content: prompt }]
    });
    const response = await stream.finalMessage();

    if (response.stop_reason === 'max_tokens') {
      return { ok: false, error: 'cut off — this section is too long to translate in one pass.' };
    }

    const toolUse = response.content.find(block => block.type === 'tool_use');
    if (!toolUse || !toolUse.input) {
      lastError = 'no translation returned.';
      console.warn(`[translate] ${langName} chunk attempt ${attempt + 1}: ${lastError} retrying...`);
      continue;
    }

    const contentSegments = normalizeContentSegments(toolUse.input.content_blob, chunkSegments.length);
    if (!contentSegments) {
      lastError = 'came back malformed.';
      console.warn(`[translate] ${langName} chunk attempt ${attempt + 1}: ${lastError} retrying...`);
      continue;
    }

    return {
      ok: true,
      title: toolUse.input.title || '',
      excerpt: toolUse.input.excerpt || '',
      contentSegments
    };
  }

  return { ok: false, error: lastError };
}

export async function POST(req) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { title, excerpt, content, targetLanguage } = await req.json();

    if (!targetLanguage) {
      return NextResponse.json({ success: false, error: 'No target language provided' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Anthropic API Key is missing. Set CLAUDE_API_KEY in the environment.' }, { status: 400 });
    }

    // Translating all 7 languages fires 7 of these requests at once (from
    // the client's concurrency-capped pool), each of which may itself issue
    // several sequential chunk calls below. maxRetries lets the SDK itself
    // absorb a transient 429/5xx with exponential backoff before it ever
    // reaches our own catch block.
    const anthropic = new Anthropic({
      apiKey: apiKey,
      maxRetries: 5,
    });

    // Pull out only the human-readable text from the content HTML — the
    // tags/classes/inline styles never need to pass through the model, so
    // this keeps both the prompt and the response far smaller than round-
    // tripping the full HTML per language (the saving is model-agnostic:
    // it applies the same whether this calls Haiku, Sonnet, or anything
    // else). The original HTML structure is restored afterward in code,
    // which also guarantees it can't be subtly altered by the model.
    const { segments } = extractTextSegments(content);

    const langName = LANG_NAMES[targetLanguage] || targetLanguage;

    // Chunk the article and translate each piece with its own call, run
    // sequentially (chunk N+1 only starts once N finishes) — this keeps
    // Anthropic request concurrency bounded to the client's per-language
    // cap instead of multiplying it by chunk count, at the cost of some
    // wall-clock time on very long posts.
    const chunks = chunkByCharBudget(segments, CHARS_PER_CALL);
    const chunkResults = [];
    for (let i = 0; i < chunks.length; i++) {
      const result = await translateChunk({
        anthropic,
        langName,
        title,
        excerpt,
        chunkSegments: chunks[i],
        includeTitleExcerpt: i === 0
      });
      if (!result.ok) {
        console.error(`Translation failed for ${targetLanguage} (chunk ${i + 1}/${chunks.length}): ${result.error}`);
        return NextResponse.json({ success: false, error: `${langName} translation ${result.error}` }, { status: 500 });
      }
      chunkResults.push(result);
    }

    const contentSegments = chunkResults.flatMap(r => r.contentSegments);

    // Rebuild the full HTML by re-parsing the original content and
    // swapping in the translated text nodes — the tag structure/styles are
    // never touched.
    const { $, textNodes } = extractTextSegments(content);
    const translation = {
      title: chunkResults[0].title,
      excerpt: chunkResults[0].excerpt,
      content: injectTextSegments($, textNodes, contentSegments)
    };

    return NextResponse.json({ success: true, lang: targetLanguage, translation });

  } catch (error) {
    console.error('Translation Error:', error);
    // Surface rate limits as 429 (rather than a flat 500) so the client's
    // retry logic can back off and try this language again instead of
    // marking it permanently failed.
    const status = error?.status === 429 ? 429 : 500;
    const message = status === 429
      ? 'Rate limited by the translation API — will retry automatically.'
      : (error.message || 'Translation failed');
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

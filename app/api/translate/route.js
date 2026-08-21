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

export async function POST(req) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { title, excerpt, content, targetLanguages } = await req.json();

    if (!targetLanguages || targetLanguages.length === 0) {
      return NextResponse.json({ success: false, error: 'No target languages provided' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Anthropic API Key is missing. Set CLAUDE_API_KEY in the environment.' }, { status: 400 });
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    // Pull out only the human-readable text from the content HTML — the
    // tags/classes/inline styles never need to pass through the model, so
    // this keeps both the prompt and the response far smaller than round-
    // tripping the full HTML per language (the saving is model-agnostic:
    // it applies the same whether this calls Haiku, Sonnet, or anything
    // else). The original HTML structure is restored afterward in code,
    // which also guarantees it can't be subtly altered by the model.
    const { segments } = extractTextSegments(content);

    // Convert language codes to full names for better translation
    const langNames = {
      hi: 'Hindi', es: 'Spanish', de: 'German', fr: 'French', ru: 'Russian', ja: 'Japanese', pt: 'Portuguese'
    };

    const requestedNames = targetLanguages.map(l => langNames[l] || l);

    const prompt = `You are an expert translator. Translate the following blog post data into these languages: ${requestedNames.join(', ')}.

RULES:
1. "content_segments" is a JSON array of text snippets taken from the post body, in reading order. Translate each string. Return them in the exact same order and with the exact same array length — never merge, split, drop, or reorder items. If a snippet is not translatable (e.g. a number or symbol), return it unchanged.
2. Return the output STRICTLY as a valid JSON object where the keys are the exact language codes (${targetLanguages.join(', ')}) and each value is an object containing "title", "excerpt", and "content_segments".
3. Do not include markdown code blocks or any extra text around the JSON output.

TITLE: ${title || ''}

EXCERPT: ${excerpt || ''}

CONTENT_SEGMENTS: ${JSON.stringify(segments)}`;

    // Size max_tokens off the actual content instead of a flat guess — a
    // fixed low cap silently truncates (and breaks JSON parsing on) longer
    // posts translated into several languages at once.
    const perLanguageTokens = estimateTokens(title) + estimateTokens(excerpt) + estimateTokens(JSON.stringify(segments));
    const estimatedOutputTokens = Math.ceil(perLanguageTokens * targetLanguages.length * 2.5);
    const maxTokens = Math.min(64000, Math.max(8000, estimatedOutputTokens));

    // Stream server-side (still returns one JSON response to the client) —
    // avoids serverless HTTP timeouts on the larger max_tokens values long
    // multi-language translations can need.
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });
    const response = await stream.finalMessage();

    const responseText = response.content[0].text.trim();
    let parsedResult;
    try {
      // In case Claude wraps the JSON in markdown blocks
      const jsonStr = responseText.replace(/```json\n?|```/g, '');
      parsedResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse Claude response:', responseText);
      return NextResponse.json({ success: false, error: 'Translation parsing failed.' }, { status: 500 });
    }

    // Rebuild each language's full HTML by re-parsing the original content
    // and swapping in that language's translated text nodes — the tag
    // structure/styles are never touched.
    const translations = {};
    for (const [lang, data] of Object.entries(parsedResult)) {
      const { $, textNodes } = extractTextSegments(content);
      translations[lang] = {
        title: data.title || '',
        excerpt: data.excerpt || '',
        content: injectTextSegments($, textNodes, data.content_segments)
      };
    }

    return NextResponse.json({ success: true, translations });

  } catch (error) {
    console.error('Translation Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Translation failed' }, { status: 500 });
  }
}

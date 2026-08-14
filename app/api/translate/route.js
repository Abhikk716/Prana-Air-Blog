import { NextResponse } from 'next/server';
import connectDB from '../../../lib/db';
import Settings from '../../../models/Settings';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req) {
  try {
    const { title, excerpt, content, targetLanguages } = await req.json();

    if (!targetLanguages || targetLanguages.length === 0) {
      return NextResponse.json({ success: false, error: 'No target languages provided' }, { status: 400 });
    }

    await connectDB();
    const settings = await Settings.findOne({});
    const apiKey = settings?.claudeApiKey || process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Anthropic API Key is missing. Please add it in settings.' }, { status: 400 });
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });
    
    // Convert language codes to full names for better translation
    const langNames = {
      hi: 'Hindi', es: 'Spanish', de: 'German', fr: 'French', ru: 'Russian', ja: 'Japanese', pt: 'Portuguese'
    };
    
    const requestedNames = targetLanguages.map(l => langNames[l] || l);

    const prompt = `You are an expert translator. Translate the following blog post data into these languages: ${requestedNames.join(', ')}. 
    
IMPORTANT RULES:
1. Preserve ALL HTML tags, classes, inline styles, and attributes in the "content".
2. Only translate the human-readable text.
3. Return the output STRICTLY as a valid JSON object where the keys are the exact language codes (${targetLanguages.join(', ')}) and the values are objects containing the translated "title", "excerpt", and "content".
4. Do not include any markdown blocks or extra text around the JSON output.

Original Text:
---
TITLE: ${title || ''}

EXCERPT: ${excerpt || ''}

CONTENT: 
${content || ''}
---`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }]
    });

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

    return NextResponse.json({ success: true, translations: parsedResult });

  } catch (error) {
    console.error('Translation Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Translation failed' }, { status: 500 });
  }
}

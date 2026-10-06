import { generateText } from 'ai';

const LANGUAGES = {
  'en-US': 'English',
  'nl-NL': 'Dutch',
  'fr-FR': 'French',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'it-IT': 'Italian',
  'hi-IN': 'Hindi',
  'ml-IN': 'Malayalam',
  'ta-IN': 'Tamil'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, sourceLanguage, targetLanguage } = req.body ?? {};
    const source = LANGUAGES[sourceLanguage];
    const target = LANGUAGES[targetLanguage];

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }
    if (!source || !target) {
      return res.status(400).json({ error: 'Unsupported language' });
    }
    if (text.length > 5000) {
      return res.status(413).json({ error: 'Text is too long' });
    }
    if (sourceLanguage === targetLanguage) {
      return res.status(200).json({ translation: text });
    }

    const result = await generateText({
      model: 'openai/gpt-5.4-nano',
      system: `You are a fast, precise live speech translator. Translate from ${source} to ${target}. Return only the translation. Preserve meaning, names, numbers, tone, and natural punctuation. Do not explain or add labels. If the source is an unfinished live-speech fragment, translate the fragment naturally without inventing missing content.`,
      prompt: text
    });

    return res.status(200).json({ translation: result.text.trim() });
  } catch (error) {
    console.error('Translation failed:', error);
    return res.status(500).json({
      error: 'Translation failed',
      detail: process.env.NODE_ENV === 'development' ? String(error) : undefined
    });
  }
}

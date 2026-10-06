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

    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) {
      console.error('No AI Gateway authentication token available');
      return res.status(500).json({ error: 'AI Gateway authentication is not configured' });
    }

    const gatewayResponse = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.6-sol',
        messages: [
          {
            role: 'system',
            content: `You are a fast, precise live speech translator. Translate from ${source} to ${target}. Return only the translation. Preserve meaning, names, numbers, tone, and natural punctuation. Do not explain or add labels. If the source is an unfinished live-speech fragment, translate only what is present without inventing missing content.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        stream: false
      })
    });

    const payload = await gatewayResponse.json().catch(() => ({}));

    if (!gatewayResponse.ok) {
      const gatewayMessage = payload?.error?.message || payload?.error || `Gateway HTTP ${gatewayResponse.status}`;
      console.error('AI Gateway error:', gatewayResponse.status, gatewayMessage);
      return res.status(502).json({
        error: 'AI translation service failed',
        code: gatewayResponse.status,
        detail: String(gatewayMessage).slice(0, 300)
      });
    }

    const translation = payload?.choices?.[0]?.message?.content?.trim();
    if (!translation) {
      console.error('AI Gateway returned no translation', payload);
      return res.status(502).json({ error: 'AI translation returned no text' });
    }

    return res.status(200).json({ translation });
  } catch (error) {
    console.error('Translation failed:', error);
    return res.status(500).json({
      error: 'Translation failed',
      detail: String(error?.message || error).slice(0, 300)
    });
  }
}

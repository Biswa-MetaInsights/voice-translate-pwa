const LANGUAGES = {
  'en-US':'English','fr-FR':'French','nl-NL':'Dutch','de-DE':'German','lb-LU':'Luxembourgish','ga-IE':'Irish',
  'da-DK':'Danish','sv-SE':'Swedish','no-NO':'Norwegian','fi-FI':'Finnish','is-IS':'Icelandic','et-EE':'Estonian',
  'lv-LV':'Latvian','lt-LT':'Lithuanian','pl-PL':'Polish','cs-CZ':'Czech','sk-SK':'Slovak','hu-HU':'Hungarian',
  'ro-RO':'Romanian','rm-CH':'Romansh','it-IT':'Italian','es-ES':'Spanish','pt-PT':'Portuguese','el-GR':'Greek',
  'mt-MT':'Maltese','ca-ES':'Catalan','bg-BG':'Bulgarian','hr-HR':'Croatian','sl-SI':'Slovenian','sr-RS':'Serbian',
  'bs-BA':'Bosnian','sq-AL':'Albanian','mk-MK':'Macedonian','uk-UA':'Ukrainian','ru-RU':'Russian','tr-TR':'Turkish',
  'ar-SA':'Arabic','zh-CN':'Chinese (Mandarin)','hi-IN':'Hindi','ml-IN':'Malayalam','ta-IN':'Tamil','te-IN':'Telugu',
  'kn-IN':'Kannada'
};

const LIMIT_WINDOW_MS = 60_000;
const LIMIT_REQUESTS = 60;
const buckets = globalThis.__voiceTranslateRateBuckets || new Map();
globalThis.__voiceTranslateRateBuckets = buckets;

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
  return ip || req.socket?.remoteAddress || 'unknown';
}

function allowed(req) {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= LIMIT_WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= LIMIT_REQUESTS;
}

async function gatewayTranslate(token, model, source, target, text) {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `Translate from ${source} to ${target}. Return only the natural translation. Preserve meaning, names, numbers, tone, and punctuation. Do not explain, label, or add content. If the text is an unfinished live-speech fragment, translate only what is present.`
        },
        { role: 'user', content: text }
      ],
      stream: false
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || `Gateway HTTP ${response.status}`;
    throw new Error(String(message));
  }

  const translation = payload?.choices?.[0]?.message?.content?.trim();
  if (!translation) throw new Error('No translation returned');
  return translation;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!allowed(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many translation requests. Please wait a moment.' });
  }

  try {
    const { text, sourceLanguage, targetLanguage } = req.body ?? {};
    const source = LANGUAGES[sourceLanguage];
    const target = LANGUAGES[targetLanguage];
    const clean = typeof text === 'string' ? text.trim() : '';

    if (!clean) return res.status(400).json({ error: 'Text is required' });
    if (!source || !target) return res.status(400).json({ error: 'Unsupported language' });
    if (clean.length > 3000) return res.status(413).json({ error: 'Text is too long' });
    if (sourceLanguage === targetLanguage) return res.status(200).json({ translation: clean });

    const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
    if (!token) {
      console.error('No AI Gateway authentication token available');
      return res.status(503).json({ error: 'Translation service is temporarily unavailable' });
    }

    let translation;
    try {
      translation = await gatewayTranslate(token, 'openai/gpt-5.4-nano', source, target, clean);
    } catch (primaryError) {
      console.warn('Primary translation model failed, retrying once:', primaryError?.message);
      translation = await gatewayTranslate(token, 'openai/gpt-5.6-sol', source, target, clean);
    }

    return res.status(200).json({ translation });
  } catch (error) {
    console.error('Translation failed:', error);
    const timeout = error?.name === 'TimeoutError' || /timeout/i.test(String(error?.message || ''));
    return res.status(timeout ? 504 : 502).json({
      error: timeout ? 'Translation timed out. Please try again.' : 'Translation temporarily unavailable'
    });
  }
}

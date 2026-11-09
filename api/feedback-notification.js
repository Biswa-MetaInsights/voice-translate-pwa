const RECIPIENT = 'metainsights.bv@gmail.com';
const ALLOWED_ORIGINS = new Set([
  'https://voicetranslator.eu',
  'https://www.voicetranslator.eu',
]);
const buckets = globalThis.__voiceTranslatorFeedbackBuckets || new Map();
globalThis.__voiceTranslatorFeedbackBuckets = buckets;

function allowedOrigin(origin = '') {
  return ALLOWED_ORIGINS.has(origin) || /^https:\/\/voice-translate-[a-z0-9-]+-metainsights\.vercel\.app$/.test(origin);
}

function limitReached(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  for (const [key, bucket] of buckets) if (now - bucket.startedAt > 60_000) buckets.delete(key);
  const bucket = buckets.get(ip) || { startedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(ip, bucket);
  return bucket.count > 5;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowedOrigin(req.headers.origin || '')) return res.status(403).json({ error: 'Origin not allowed' });
  if (limitReached(req)) return res.status(429).json({ error: 'Too many requests' });

  const { source_app, category, message, name, email } = req.body || {};
  if (source_app !== 'VoiceTranslator.eu'
    || typeof category !== 'string' || !category.trim() || category.length > 100
    || typeof message !== 'string' || !message.trim() || message.length > 3000
    || (name != null && (typeof name !== 'string' || name.length > 100))
    || (email != null && (typeof email !== 'string' || email.length > 254))) {
    return res.status(400).json({ error: 'Invalid feedback details' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FEEDBACK_FROM_EMAIL;
  if (!apiKey || !from) return res.status(503).json({ error: 'Email notifications are not configured' });

  const lines = [
    'New feedback submitted through VoiceTranslator.eu',
    '',
    `App: ${source_app}`,
    `Topic: ${category.trim()}`,
    `Name: ${name?.trim() || 'Not provided'}`,
    `Reply email: ${email?.trim() || 'Not provided'}`,
    '',
    'Feedback:',
    message.trim(),
  ];

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        subject: `[${source_app}] ${category.trim()}`,
        text: lines.join('\n'),
      }),
    });
    if (!response.ok) return res.status(502).json({ error: 'Email provider could not send the notification' });
    return res.status(200).json({ sent: true });
  } catch {
    return res.status(502).json({ error: 'Email provider is temporarily unavailable' });
  }
}

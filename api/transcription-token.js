import { gateway } from '@ai-sdk/gateway';

const WINDOW_MS = 60_000;
const MAX_TOKENS_PER_MINUTE = 12;
const buckets = globalThis.__voiceTranslateTokenBuckets || new Map();
globalThis.__voiceTranslateTokenBuckets = buckets;

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || '').split(',')[0].trim();
  return ip || req.socket?.remoteAddress || 'unknown';
}

function allowed(req) {
  const now = Date.now();
  const key = clientKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= MAX_TOKENS_PER_MINUTE;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!allowed(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many microphone sessions. Please wait a moment.' });
  }

  try {
    const { token, url } = await gateway.experimental_transcription.getToken({
      model: 'openai/gpt-realtime-whisper',
    });

    return res.status(200).json({ token, url });
  } catch (error) {
    console.error('Failed to create transcription token:', error);
    return res.status(503).json({
      error: 'Speech service is temporarily unavailable',
    });
  }
}

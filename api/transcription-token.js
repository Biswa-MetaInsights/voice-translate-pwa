import { createGateway } from '@ai-sdk/gateway';

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

function safeError(error) {
  const message = String(error?.message || error || 'Unknown AI Gateway error')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 220);
  const status = Number(error?.statusCode || error?.status || error?.response?.status || 0) || undefined;
  return { message, status };
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

  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    console.error('No AI Gateway authentication is available to the transcription token route');
    return res.status(503).json({
      error: 'Speech token service is not authenticated',
      detail: 'AI Gateway authentication is missing on the server.',
      code: 'gateway_auth_missing',
    });
  }

  try {
    const gateway = createGateway({ apiKey });
    const { token, url } = await gateway.experimental_transcription.getToken({
      model: 'openai/gpt-realtime-whisper',
    });

    if (!token) {
      console.error('AI Gateway returned no transcription token');
      return res.status(503).json({
        error: 'Speech token was not created',
        detail: 'AI Gateway returned an empty transcription token.',
        code: 'gateway_empty_token',
      });
    }

    return res.status(200).json({ token, url });
  } catch (error) {
    const info = safeError(error);
    console.error('Failed to create transcription token:', info);
    return res.status(503).json({
      error: 'Speech token service failed',
      detail: info.message,
      code: 'gateway_token_failed',
      upstreamStatus: info.status,
    });
  }
}

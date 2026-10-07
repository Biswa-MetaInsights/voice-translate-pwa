import { createGateway } from '@ai-sdk/gateway';
import { getVercelOidcToken } from '@vercel/oidc';

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

async function resolveGatewayCredential() {
  if (process.env.AI_GATEWAY_API_KEY) {
    return { apiKey: process.env.AI_GATEWAY_API_KEY, source: 'api-key' };
  }

  if (process.env.VERCEL_OIDC_TOKEN) {
    return { apiKey: process.env.VERCEL_OIDC_TOKEN, source: 'oidc-env' };
  }

  const oidcToken = await getVercelOidcToken({
    project: 'prj_RCmmAHDK2I3nIzx2ah6QzHpYQkOT',
    team: 'team_jCrTWcpxHy5Bdmnr30kl9Bp4',
  });

  if (oidcToken) {
    return { apiKey: oidcToken, source: 'oidc-runtime' };
  }

  return { apiKey: '', source: 'none' };
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
    const credential = await resolveGatewayCredential();

    if (!credential.apiKey) {
      console.error('No AI Gateway authentication is available to the transcription token route');
      return res.status(503).json({
        error: 'Speech token service is not authenticated',
        detail: 'Vercel did not provide an AI Gateway API key or runtime OIDC token.',
        code: 'gateway_auth_missing',
      });
    }

    const gateway = createGateway({ apiKey: credential.apiKey });
    const { token, url } = await gateway.experimental_transcription.getToken({
      model: 'openai/gpt-realtime-whisper',
    });

    if (!token) {
      console.error('AI Gateway returned no transcription token', { authSource: credential.source });
      return res.status(503).json({
        error: 'Speech token was not created',
        detail: 'AI Gateway returned an empty transcription token.',
        code: 'gateway_empty_token',
      });
    }

    console.log('Realtime transcription token created', { authSource: credential.source });
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

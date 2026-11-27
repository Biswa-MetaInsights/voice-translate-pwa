import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export async function mobileRpc(name, body, { env = process.env, fetchImpl = fetch } = {}) {
  const url = new URL(env.MOBILE_SUPABASE_URL || 'https://invalid.invalid');
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.port || !env.MOBILE_SUPABASE_SECRET_KEY) throw new Error('mobile_controls_unavailable');
  const key = env.MOBILE_SUPABASE_SECRET_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  const response = await fetchImpl(`${url.origin}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000), redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw new Error('mobile_controls_unavailable');
  return response.json();
}

export async function admitMobileRequest(headers, { env = process.env, rpc = mobileRpc, now = Date.now } = {}) {
  try {
    if (!env.MOBILE_LIMIT_KEY || env.MOBILE_LIMIT_KEY.length < 32) throw new Error();
    // Vercel overwrites this header. Other hosts need a trusted ingress adapter.
    const read = key => headers instanceof Headers ? headers.get(key) : headers[key];
    const ip = String(read('x-vercel-forwarded-for') || '').split(',')[0].trim();
    if (!isIP(ip)) throw new Error();
    const minute = Math.floor(now() / 60_000);
    const fingerprint = createHmac('sha256', env.MOBILE_LIMIT_KEY).update(`${minute}:${ip}`).digest('hex');
    const result = await rpc('vt_mobile_admit', { p_fingerprint: fingerprint,
      p_minute_limit: bounded(env.MOBILE_REQUESTS_PER_MINUTE, 120, 600), p_daily_limit: bounded(env.MOBILE_REQUESTS_PER_DAY, 10000, 100000) }, { env });
    if (result !== true && result !== false) throw new Error();
    return result ? null : { status: 429, retry: '60', error: 'Translation is busy. Please try again later.' };
  } catch {
    return { status: 503, retry: '60', error: 'Mobile service is temporarily unavailable. Please try again later.' };
  }
}
function bounded(value, fallback, max) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error();
  return n;
}

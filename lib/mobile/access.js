// A separate, disabled-by-default API surface. CORS identifies compatible clients;
// it is not authentication. Enforce deployment rate limits/budgets before release.
import { admitMobileRequest } from './controls.js';
export const MOBILE_ORIGINS = new Set(['capacitor://localhost', 'https://localhost']);
const ALLOWED_HEADERS = new Set(['content-type', 'x-source-language', 'x-voicetranslator-consent']);
export function mobileAccess({ method, origin, requestedMethod, requestedHeaders }, env = process.env) {
  const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff', 'X-VoiceTranslator-API-Version': '1' };
  if (env.MOBILE_API_ENABLED !== 'true') return { status: 503, headers, error: 'Mobile translation is not enabled yet.' };
  if (!MOBILE_ORIGINS.has(origin)) return { status: 403, headers, error: 'This mobile client is not supported.' };
  headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Expose-Headers'] = 'Retry-After, Content-Type, X-VoiceTranslator-API-Version';
  if (method === 'OPTIONS') {
    if (requestedMethod !== 'POST' || String(requestedHeaders || '').split(',').filter(Boolean).some(h => !ALLOWED_HEADERS.has(h.trim().toLowerCase()))) {
      return { status: 403, headers, error: 'This mobile request is not supported.' };
    }
    return { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': [...ALLOWED_HEADERS].join(', '), 'Access-Control-Max-Age': '300' } };
  }
  if (method !== 'POST') return { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' }, error: 'Method not allowed' };
  return { status: 0, headers };
}
export function withMobileAccess(handler, env = process.env, { admit = admitMobileRequest } = {}) {
  return async (req, res) => {
    const access = mobileAccess({ method: req.method, origin: req.headers.origin,
      requestedMethod: req.headers['access-control-request-method'], requestedHeaders: req.headers['access-control-request-headers'] }, env);
    for (const [k, v] of Object.entries(access.headers)) res.setHeader(k, v);
    if (access.status === 204) return res.status(204).end();
    if (access.status) return res.status(access.status).json({ error: access.error });
    const denied = await admit(req.headers, { env });
    if (denied) { res.setHeader('Retry-After', denied.retry); return res.status(denied.status).json({ error: denied.error }); }
    return handler(req, res); // Preserve streaming, cancellation, validation and rate limits.
  };
}
export function withMobileUpload(handler, env = process.env, { admit = admitMobileRequest } = {}) {
  return async request => {
    const access = mobileAccess({ method: request.method, origin: request.headers.get('origin'),
      requestedMethod: request.headers.get('access-control-request-method'), requestedHeaders: request.headers.get('access-control-request-headers') }, env);
    if (access.status) return new Response(access.status === 204 ? null : JSON.stringify({ error: access.error }),
      { status: access.status, headers: { ...access.headers, 'Content-Type': 'application/json' } });
    const denied = await admit(request.headers, { env });
    if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: { ...access.headers, 'Retry-After': denied.retry } });
    // The original web upload deliberately accepts same-origin browser requests.
    // Only after this separate mobile policy succeeds, delegate to that handler
    // with its own origin. Never change or relax the existing web endpoint.
    const headers = new Headers(request.headers);
    headers.set('Origin', new URL(request.url).origin);
    const response = await handler(new Request(request, { headers }));
    const outputHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(access.headers)) outputHeaders.set(k, v);
    return new Response(response.body, { status: response.status, headers: outputHeaders });
  };
}

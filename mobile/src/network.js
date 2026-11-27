const ROUTES = new Set(['translate', 'transcription-token', 'transcribe-audio', 'speak', 'conversation-summary', 'report']);
export function validateBackend(value, { allowProduction = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Set MOBILE_BACKEND_ORIGIN to the HTTPS mobile test backend.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' ||
      !(url.hostname.endsWith('.vercel.app') || url.hostname === 'voicetranslator.eu' || url.hostname.endsWith('.voicetranslator.eu')) || url.hostname.endsWith('.invalid')) {
    throw new Error('The mobile backend must be an HTTPS VoiceTranslator or Vercel origin, with no path or credentials.');
  }
  if (['voicetranslator.eu', 'www.voicetranslator.eu'].includes(url.hostname) && !allowProduction) {
    throw new Error('Use a separate test backend. Production builds require MOBILE_ALLOW_PRODUCTION_BACKEND=true.');
  }
  return url.origin;
}
export function createMobileFetch({ backend, localOrigin, fetchImpl = fetch }) {
  const base = validateBackend(backend, { allowProduction: true });
  const local = new URL(localOrigin);
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, local);
    // URL.origin is "null" for the capacitor:// custom scheme on iOS.
    // Compare scheme and authority explicitly; do not accept any opaque origin.
    if (url.protocol !== local.protocol || url.host !== local.host || !url.pathname.startsWith('/api/')) return fetchImpl(input, init);
    const route = url.pathname.slice(5);
    if (!ROUTES.has(route) || (url.search && !(route === 'transcription-token' && url.search === '?model=whisper'))) {
      throw new Error('This feature is not available in the mobile app yet.');
    }
    // Do not buffer responses: retain the existing translation stream and AbortSignal.
    const target = base + '/api/mobile/v1/' + route + url.search;
    const options = { ...(input instanceof Request ? { method: input.method, headers: input.headers, body: input.body, signal: input.signal, duplex: 'half' } : {}),
      ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', mode: 'cors' };
    return fetchImpl(target, options);
  };
}

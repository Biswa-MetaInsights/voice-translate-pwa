const PUBLIC_HOSTS = new Set(['voicetranslator.eu', 'www.voicetranslator.eu']);
const PUBLIC_PAGES = new Set(['/', '/index.html', '/install.html', '/privacy.html']);

export function canMeasureTraffic(location, navigator) {
  return location.protocol === 'https:' && PUBLIC_HOSTS.has(location.hostname)
    && navigator.doNotTrack !== '1' && navigator.globalPrivacyControl !== true;
}

export function sanitizePageview(event) {
  // Never send custom events, conversation content or unknown application paths.
  if (event.type !== 'pageview') return null;
  try {
    const url = new URL(event.url);
    if (url.protocol !== 'https:' || !PUBLIC_HOSTS.has(url.hostname) || !PUBLIC_PAGES.has(url.pathname)) return null;
    return { type: 'pageview', url: url.origin + url.pathname };
  } catch {
    return null;
  }
}

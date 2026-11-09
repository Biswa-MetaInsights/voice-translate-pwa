import { canMeasureTraffic, sanitizePageview } from './analytics-policy.js';

// Analytics must never prevent speech capture or translation from starting.
if (canMeasureTraffic(window.location, navigator)) {
  import('@vercel/analytics').then(({ inject }) => {
    inject({ mode: 'production', beforeSend: sanitizePageview });
  }).catch(() => {});
}

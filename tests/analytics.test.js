import test from 'node:test';
import assert from 'node:assert/strict';
import { canMeasureTraffic, sanitizePageview } from '../src/analytics-policy.js';

test('traffic measurement respects privacy signals and excludes preview/local hosts', () => {
  const production = { protocol: 'https:', hostname: 'www.voicetranslator.eu' };
  assert.equal(canMeasureTraffic(production, {}), true);
  assert.equal(canMeasureTraffic(production, { doNotTrack: '1' }), false);
  assert.equal(canMeasureTraffic(production, { globalPrivacyControl: true }), false);
  assert.equal(canMeasureTraffic({ ...production, hostname: 'preview.vercel.app' }, {}), false);
  assert.equal(canMeasureTraffic({ protocol: 'http:', hostname: 'localhost' }, {}), false);
});

test('pageview filtering removes queries and fragments and drops custom/private events', () => {
  const event = { type: 'pageview', url: 'https://www.voicetranslator.eu/?text=PRIVATE#SECRET' };
  assert.equal(sanitizePageview(event).url, 'https://www.voicetranslator.eu/');
  assert.equal(sanitizePageview({ type: 'event', url: event.url, name: 'PRIVATE' }), null);
  assert.equal(sanitizePageview({ type: 'pageview', url: 'https://www.voicetranslator.eu/traffic.html' }), null);
  assert.equal(sanitizePageview({ type: 'pageview', url: 'https://example.org/' }), null);
  assert.equal(sanitizePageview({ type: 'pageview', url: 'invalid' }), null);
});

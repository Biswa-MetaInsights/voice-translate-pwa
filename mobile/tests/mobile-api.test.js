import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileAccess, withMobileAccess, withMobileUpload } from '../../lib/mobile/access.js';
import { createVoiceNoteHandler } from '../../lib/voice-note/handler.js';
const enabled = { MOBILE_API_ENABLED: 'true' };
test('mobile API is disabled by default and rejects unknown/null/missing origins', () => {
  assert.equal(mobileAccess({ method: 'POST', origin: 'https://localhost' }, {}).status, 503);
  for (const origin of [undefined, null, 'null', 'https://localhost.evil.test', 'https://voicetranslator.eu', 'http://localhost']) {
    const access = mobileAccess({ method: 'POST', origin }, enabled);
    assert.equal(access.status, 403); assert.equal(access.headers['Access-Control-Allow-Origin'], undefined);
  }
});
test('only the supported native origins and POST preflight headers are allowed', () => {
  for (const origin of ['capacitor://localhost', 'https://localhost']) {
    const access = mobileAccess({ method: 'OPTIONS', origin, requestedMethod: 'POST', requestedHeaders: 'Content-Type, X-VoiceTranslator-Consent, X-Source-Language' }, enabled);
    assert.equal(access.status, 204); assert.equal(access.headers['Access-Control-Allow-Origin'], origin);
    assert.equal(access.headers['Access-Control-Allow-Credentials'], undefined);
  }
  assert.equal(mobileAccess({ method: 'OPTIONS', origin: 'https://localhost', requestedMethod: 'DELETE' }, enabled).status, 403);
  assert.equal(mobileAccess({ method: 'OPTIONS', origin: 'https://localhost', requestedMethod: 'POST', requestedHeaders: 'Authorization' }, enabled).status, 403);
  assert.equal(mobileAccess({ method: 'GET', origin: 'https://localhost' }, enabled).status, 405);
});
test('mobile streaming wrapper delegates without buffering, logging or changing the body', async () => {
  const headers = {}, chunks = []; let forwarded;
  const request = { method: 'POST', headers: { origin: 'https://localhost' }, body: { text: 'test' } };
  const response = { setHeader: (k, v) => { headers[k] = v; }, write: value => chunks.push(value), end: () => chunks.push('end') };
  await withMobileAccess(async (req, res) => { forwarded = req; res.write('progress\n'); await Promise.resolve(); res.write('done\n'); res.end(); }, enabled, { admit: async () => null })(request, response);
  assert.equal(forwarded, request); assert.deepEqual(chunks, ['progress\n', 'done\n', 'end']);
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(headers['X-VoiceTranslator-API-Version'], '1');
});
test('native upload adapter preserves consent/type/size checks without opening the original web handler', async () => {
  let calls = 0;
  const env = { ...enabled, VOICE_NOTE_UPLOAD_ENABLED: 'true' };
  const original = createVoiceNoteHandler({ env, transcribe: async () => { calls++; return { text: 'مرحبا' }; } });
  const mobile = withMobileUpload(original, env, { admit: async () => null });
  const audio = new Uint8Array(40); audio.set(new TextEncoder().encode('OggS')); audio.set(new TextEncoder().encode('OpusHead'), 28);
  const make = (overrides = {}) => new Request('https://mobile-test.voicetranslator.eu/api/mobile/v1/transcribe-audio', { method: 'POST', body: audio,
    headers: { origin: 'capacitor://localhost', 'content-type': 'audio/ogg', 'x-voicetranslator-consent': 'audio-v1', ...overrides } });
  assert.equal((await original(make())).status, 403);
  assert.equal((await mobile(make({ origin: 'https://evil.test' }))).status, 403);
  assert.equal((await mobile(make({ 'x-voicetranslator-consent': '' }))).status, 400);
  assert.equal((await mobile(make({ 'content-type': 'audio/mpeg' }))).status, 415);
  assert.equal((await mobile(make({ 'content-length': '4000001' }))).status, 413);
  const good = await mobile(make()); assert.equal(good.status, 200); assert.equal(calls, 1);
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'capacitor://localhost');
  assert.equal(good.headers.get('Cache-Control'), 'no-store');
  assert.equal(good.headers.get('X-VoiceTranslator-API-Version'), '1');
});

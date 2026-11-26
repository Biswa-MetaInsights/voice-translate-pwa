import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackend, createMobileFetch } from '../src/network.js';
import { sharedAudioFile } from '../src/share.js';
import { expiredExports, exportMp3 } from '../src/export.js';
test('build configuration requires an explicit safe backend and deliberate production opt-in', () => {
  for (const value of [undefined, 'http://example.vercel.app', 'https://127.0.0.1', 'https://example.vercel.app/private', 'https://secret@example.vercel.app', 'https://example.vercel.app#secret', 'https://example.test']) {
    assert.throws(() => validateBackend(value));
  }
  assert.throws(() => validateBackend('https://www.voicetranslator.eu'));
  assert.equal(validateBackend('https://www.voicetranslator.eu', { allowProduction: true }), 'https://www.voicetranslator.eu');
  assert.equal(validateBackend('https://mobile-test.vercel.app'), 'https://mobile-test.vercel.app');
});
test('MP3 export is user-directed, bounded, and aged cache files are identifiable for cleanup', async () => {
  const calls = [];
  const path = await exportMp3(new Blob(['sample'], { type: 'audio/mpeg' }), {
    now: () => 1_800_000_000_000, encode: async () => 'c2FtcGxl',
    filesystem: { writeFile: async data => calls.push(data), getUri: async () => ({ uri: 'file:///private/cache/export.mp3' }) },
    share: { share: async data => calls.push(data) },
  });
  assert.match(path, /^voice-translator-exports\/1800000000000-[0-9a-f-]+\.mp3$/);
  assert.equal(calls[0].directory, 'CACHE'); assert.deepEqual(calls[1].files, ['file:///private/cache/export.mp3']);
  assert.equal(expiredExports([{ name: path.split('/')[1] }], 1_800_000_600_001).length, 1);
  assert.equal(expiredExports([{ name: path.split('/')[1] }, { name: '../private-file' }], 1_800_000_001_000).length, 0);
  await assert.rejects(exportMp3(new Blob(['sample'], { type: 'text/html' })), /MP3/);
});
test('a failed export preparation removes partial private files without opening the share sheet', async () => {
  const removed = []; let opened = false;
  await assert.rejects(exportMp3(new Blob(['sample'], { type: 'audio/mpeg' }), {
    encode: async () => 'c2FtcGxl',
    filesystem: {
      writeFile: async () => {},
      getUri: async () => { throw new Error('prepare failed'); },
      deleteFile: async value => removed.push(value),
    },
    share: { share: async () => { opened = true; } },
  }), /prepare failed/);
  assert.equal(opened, false); assert.equal(removed.length, 1); assert.equal(removed[0].directory, 'CACHE');
});
test('mobile fetch routes only our APIs, retains streaming and abort, and never redirects or sends cookies', async () => {
  const calls = [], abort = new AbortController();
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('progress\n')); } });
  const response = new Response(stream);
  const fetchImpl = async (...args) => { calls.push(args); return response; };
  const fetch = createMobileFetch({ backend: 'https://mobile-test.vercel.app', localOrigin: 'https://localhost', fetchImpl });
  assert.equal(await fetch('/api/translate', { method: 'POST', body: '{}', signal: abort.signal }), response);
  assert.equal(calls[0][0], 'https://mobile-test.vercel.app/api/mobile/v1/translate');
  assert.equal(calls[0][1].signal, abort.signal); assert.equal(calls[0][1].credentials, 'omit'); assert.equal(calls[0][1].redirect, 'error');
  const reader = response.body.getReader(); assert.equal(new TextDecoder().decode((await reader.read()).value), 'progress\n'); await reader.cancel();
  await fetch('https://speech.example.test/token', { method: 'POST' });
  assert.equal(calls[1][0], 'https://speech.example.test/token');
  await fetch('/api/transcription-token?model=whisper', { method: 'POST' });
  assert.match(calls[2][0], /\/api\/mobile\/v1\/transcription-token\?model=whisper$/);
  await assert.rejects(fetch('/api/feedback-notification'), /not available/);
  await assert.rejects(fetch('/api/transcribe-audio?url=https://evil.test'), /not available/);
});
test('native shared audio is sniffed independently of claimed filename/type and bounded', () => {
  const bytes = Buffer.alloc(40); bytes.write('OggS'); bytes.write('OpusHead', 28);
  const file = sharedAudioFile({ base64: bytes.toString('base64'), mime: 'image/png', name: 'private name' });
  assert.equal(file.type, 'audio/ogg'); assert.equal(file.name, 'shared-voice-note'); assert.equal(file.size, 40);
  assert.throws(() => sharedAudioFile({ base64: Buffer.from('<html>not audio</html>').toString('base64') }));
  assert.throws(() => sharedAudioFile({ base64: '!!!' }));
  assert.throws(() => sharedAudioFile({ base64: 'A'.repeat(5_333_340) }));
});
test('iOS custom scheme routes correctly without trusting opaque URL origins', async () => {
  const urls = [];
  const fetch = createMobileFetch({ backend: 'https://mobile-test.vercel.app', localOrigin: 'capacitor://localhost', fetchImpl: async url => { urls.push(url); return new Response(); } });
  await fetch('/api/transcribe-audio', { method: 'POST' });
  await fetch('capacitor://other-app/api/transcribe-audio', { method: 'POST' });
  assert.deepEqual(urls, ['https://mobile-test.vercel.app/api/mobile/v1/transcribe-audio', 'capacitor://other-app/api/transcribe-audio']);
});

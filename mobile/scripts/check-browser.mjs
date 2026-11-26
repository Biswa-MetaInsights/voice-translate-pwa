import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.VOICE_NOTE_PLAYWRIGHT_MODULE || 'playwright');
const binary = process.env.VOICE_NOTE_CHROMIUM_MODULE ? (await import(process.env.VOICE_NOTE_CHROMIUM_MODULE)).default : null;
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname), file = resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root)) throw new Error();
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream'); response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: binary ? await binary.executablePath() : process.env.PLAYWRIGHT_EXECUTABLE_PATH, headless: true, args: binary?.args || ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errors = [], requests = []; let uploads = 0;
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/api/mobile/**', async route => {
    const request = route.request(); requests.push(new URL(request.url()).pathname);
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' } });
    const payload = request.url().includes('/transcribe-audio') ? (++uploads, { text: 'الموعد يوم الجمعة الساعة 10:30' }) : { translation: 'The appointment is on Friday at 10:30.', targetLanguage: 'en-US', needsReview: false };
    return route.fulfill({ json: payload, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  const page = await context.newPage(); await page.goto(base);
  await page.waitForSelector('.mobile-tabs');
  for (const id of ['micSourceBtn', 'meetingSourceBtn', 'conversationSourceBtn']) assert.equal(await page.locator('#' + id).count(), 1);
  assert.equal(await page.locator('.infoCard').count(), 0);
  assert.equal(await page.locator('#meetingSourceBtn').isVisible(), false);
  await page.locator('.mobile-tabs a[href="/voice-note.html"]').click(); await page.waitForSelector('.mobile-tabs');
  const bytes = Buffer.alloc(100); bytes.write('OggS'); bytes.write('OpusHead', 28);
  await page.locator('#voiceNoteFile').setInputFiles({ name: 'fixture.opus', mimeType: 'audio/ogg', buffer: bytes });
  await page.waitForFunction(() => !document.getElementById('clearNote').disabled);
  assert.equal(uploads, 0); assert.equal(await page.locator('#translateNote').isDisabled(), true);
  await page.locator('a[href="/privacy.html"]').first().click();
  assert.equal(await page.locator('dialog').isVisible(), true); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('#voiceNoteConsent').check(); await page.locator('#translateNote').click();
  await page.waitForFunction(() => document.getElementById('noteTranslation').textContent.includes('Friday'));
  assert.equal(uploads, 1);
  await page.getByText('See original words', { exact: true }).click();
  assert.equal(await page.locator('#noteTranscript').innerText(), 'الموعد يوم الجمعة الساعة 10:30');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  await page.locator('#clearNote').click(); assert.equal(await page.locator('#voiceNoteConsent').isChecked(), false);
  assert.equal(await page.locator('#originalNoteAudio').getAttribute('src'), null);
  assert.deepEqual(errors, []); assert(requests.includes('/api/mobile/v1/translate'));
  await context.route('**/mobile-config.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await page.reload(); await page.getByRole('heading', { name: 'VoiceTranslator could not start' }).waitFor();
  console.log('Built mobile UI browser checks passed: live controls, navigation, consent, fixture transcription/translation, clear, no worker. Native sharing/hardware not simulated.');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }

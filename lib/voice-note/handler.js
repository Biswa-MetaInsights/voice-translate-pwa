import { createHash } from 'node:crypto';
import { voiceNoteMime, VOICE_NOTE_MAX_BYTES, VOICE_NOTE_LANGUAGES } from '../voice-note-format.js';
const response = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function localUploadLimits({ now = Date.now } = {}) {
  const buckets = new Map(); let active = 0;
  return {
    allow(request) {
      const t = now(); for (const [k, b] of buckets) if (t - b.start >= 60_000) buckets.delete(k);
      // Warm-instance abuse guard only. Configure a platform rate limit before public activation.
      const key = createHash('sha256').update(request.headers.get('x-real-ip') || 'local').digest('hex');
      if (buckets.size >= 1000 && !buckets.has(key)) return false;
      const b = buckets.get(key) || { start: t, count: 0 }; buckets.set(key, b);
      return ++b.count <= 6;
    },
    enter() { if (active >= 2) return false; active++; return true; },
    leave() { active = Math.max(0, active - 1); },
  };
}
export function createVoiceNoteHandler({ transcribe, env = process.env, limits = localUploadLimits(), timeoutMs = 35_000 } = {}) {
  return async request => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (env.VOICE_NOTE_UPLOAD_ENABLED !== 'true') return response(503, { error: 'Voice-note translation is not enabled yet.' });
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return response(403, { error: 'Open VoiceTranslator to upload a voice note.' });
    if (request.headers.get('x-voicetranslator-consent') !== 'audio-v1') return response(400, { error: 'Please confirm audio processing before translating.' });
    const sourceLanguage = request.headers.get('x-source-language') || 'ar-SA';
    if (sourceLanguage !== 'auto' && !Object.hasOwn(VOICE_NOTE_LANGUAGES, sourceLanguage)) return response(400, { error: 'Unsupported source language.' });
    if (request.headers.get('content-encoding') && request.headers.get('content-encoding') !== 'identity') return response(415, { error: 'Compressed request bodies are not accepted.' });
    if (Number(request.headers.get('content-length')) > VOICE_NOTE_MAX_BYTES) return response(413, { error: 'Choose a voice note smaller than 4 MB.' });
    if (!limits.allow(request) || !limits.enter()) return response(429, { error: 'Voice-note translation is busy. Please try again shortly.' });
    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const timer = setTimeout(() => controller.abort(new DOMException('Voice-note processing timed out', 'TimeoutError')), timeoutMs);
    let audio; const chunks = []; let reader;
    try {
      if (!request.body) return response(400, { error: 'Choose an audio file.' });
      reader = request.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancel, { once: true });
      let size = 0;
      try {
        while (true) {
          signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > VOICE_NOTE_MAX_BYTES) return response(413, { error: 'Choose a voice note smaller than 4 MB.' });
          chunks.push(Buffer.from(value));
        }
      } finally { signal.removeEventListener('abort', cancel); await reader.cancel().catch(() => {}); }
      signal.throwIfAborted();
      audio = Buffer.concat(chunks); for (const c of chunks) c.fill(0);
      let mime;
      try { mime = voiceNoteMime(audio.subarray(0, 512), audio.length); }
      catch { return response(415, { error: 'Unsupported audio. Choose an Opus/OGG, M4A, MP3, WAV or WebM voice note.' }); }
      const declared = request.headers.get('content-type')?.split(';')[0].toLowerCase();
      if (declared !== mime) return response(415, { error: 'The audio format does not match the file content.' });
      const result = await transcribe(audio, { sourceLanguage, mimeType: mime, signal });
      signal.throwIfAborted();
      const text = typeof result?.text === 'string' ? result.text.trim() : '';
      if (!text) return response(422, { error: 'No clear speech was recognized. Try a clearer voice note.' });
      if (text.length > 12_000) return response(422, { error: 'This voice note is too long. Please select a shorter note.' });
      return response(200, { text, sourceLanguage, language: typeof result.language === 'string' ? result.language.slice(0, 32) : null,
        reviewRequired: true }); // no calibrated speech-confidence score is available
    } catch (error) {
      // Do not log provider error objects, audio, filenames, transcripts, or credentials.
      if (signal.aborted) return response(504, { error: 'Voice-note processing stopped or timed out. Please try again.' });
      if (error.message === 'voice_note_too_long') return response(422, { error: 'Choose a voice note no longer than five minutes.' });
      return response(502, { error: 'The voice note could not be transcribed. Please try again.' });
    } finally {
      clearTimeout(timer); audio?.fill(0); for (const c of chunks) c.fill(0); limits.leave();
    }
  };
}

import { voiceNoteMime, VOICE_NOTE_MAX_BYTES, VOICE_NOTE_LANGUAGES } from '../lib/voice-note-format.js';
import { requestTranslation, splitPhrases } from './translation-client.js';
export async function translateVoiceNote(file, { sourceLanguage = 'ar-SA', targetLanguage = 'en-US', consent = false, signal, onStage = () => {}, onTranscript = () => {}, fetchImpl = fetch, translate = requestTranslation } = {}) {
  if (!consent) throw new Error('Confirm audio processing before translating.');
  if (!Object.hasOwn(VOICE_NOTE_LANGUAGES, targetLanguage) || (sourceLanguage !== 'auto' && !Object.hasOwn(VOICE_NOTE_LANGUAGES, sourceLanguage))) throw new Error('Choose a supported language.');
  if (!file || !file.size || file.size > VOICE_NOTE_MAX_BYTES) throw new Error('Choose an audio file smaller than 4 MB.');
  signal?.throwIfAborted();
  const header = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const mime = voiceNoteMime(header, file.size);
  onStage('Transcribing the voice note…');
  const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), 40_000);
  let result;
  try {
    const r = await fetchImpl('/api/transcribe-audio', { method: 'POST', headers: { 'Content-Type': mime, 'X-Source-Language': sourceLanguage, 'X-VoiceTranslator-Consent': 'audio-v1' }, body: file, signal: combined });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Could not transcribe this voice note.');
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 12_000) throw new Error('No clear speech was returned.');
    result = data;
  } finally { clearTimeout(timer); }
  signal?.throwIfAborted(); onTranscript(result.text);
  onStage('Translating the voice note…');
  const translations = [];
  for (const text of splitPhrases(result.text, 2400)) {
    signal?.throwIfAborted();
    const translated = await translate({ text, sourceLanguage, targetLanguage, quality: 'accurate', context: [] }, { signal, fetchImpl });
    if (translated.needsReview === true || typeof translated.translation !== 'string' || !translated.translation.trim()) throw new Error('The meaning was unclear. Review the original transcript and try a clearer note.');
    translations.push(translated.translation.trim());
  }
  signal?.throwIfAborted();
  return { transcript: result.text, translation: translations.join('\n\n'), targetLanguage };
}

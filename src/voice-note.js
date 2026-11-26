import { translateVoiceNote } from './voice-note-client.js';
import { voiceNoteMime, VOICE_NOTE_LANGUAGES, VOICE_NOTE_MAX_BYTES } from '../lib/voice-note-format.js';
import { splitPhrases } from './translation-client.js';
const el = id => document.getElementById(id);
const status = text => { el('voiceNoteStatus').textContent = text; };
let selectedFile = null, originalURL = '', outputURL = '', controller = null, playbackController = null, generation = 0, selectedLanguage = '', translatedText = '';
for (const [code, name] of Object.entries(VOICE_NOTE_LANGUAGES)) {
  for (const id of ['voiceNoteSource','voiceNoteTarget']) { const o = document.createElement('option'); o.value = code; o.textContent = name; el(id).append(o); }
}
const auto = document.createElement('option'); auto.value = 'auto'; auto.textContent = 'Auto-detect'; el('voiceNoteSource').append(auto);
el('voiceNoteSource').value = 'ar-SA'; el('voiceNoteTarget').value = 'en-US';
function stopPlayback() {
  playbackController?.abort(); playbackController = null;
  const a = el('translatedNoteAudio'); a.pause(); a.removeAttribute('src'); a.load(); a.hidden = true;
  if (outputURL) URL.revokeObjectURL(outputURL); outputURL = ''; el('stopNotePlayback').hidden = true;
}
function invalidate() {
  generation++; controller?.abort(); controller = null; stopPlayback();
  translatedText = ''; el('noteTranscript').textContent = ''; el('noteTranslation').textContent = ''; el('noteResults').hidden = true;
  el('copyNoteTranslation').disabled = el('playNoteTranslation').disabled = true;
  el('cancelNote').hidden = true; refresh();
}
function refresh() {
  el('translateNote').disabled = !selectedFile || !el('voiceNoteConsent').checked || Boolean(controller);
  el('clearNote').disabled = !selectedFile;
}
function clearNote(preserveInput = false) {
  invalidate(); selectedFile = null; if (preserveInput !== true) el('voiceNoteFile').value = ''; el('voiceNoteConsent').checked = false;
  const audio = el('originalNoteAudio'); audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true;
  if (originalURL) URL.revokeObjectURL(originalURL); originalURL = '';
  el('selectedNote').textContent = 'No voice note selected.'; status('Choose a voice note to begin.'); refresh();
}
async function selectFile(file) {
  clearNote(true); if (!file) return;
  const version = generation;
  try {
    if (!file.size || file.size > VOICE_NOTE_MAX_BYTES) throw new Error('Choose a voice note smaller than 4 MB.');
    const mime = voiceNoteMime(new Uint8Array(await file.slice(0, 512).arrayBuffer()), file.size);
    if (version !== generation) return;
    // A generic name avoids sending the personal filename to the server.
    selectedFile = new File([file], 'voice-note', { type: mime });
    el('selectedNote').textContent = `${file.name || 'Shared voice note'} · ${(file.size / 1_000_000).toFixed(2)} MB`;
    originalURL = URL.createObjectURL(selectedFile); el('originalNoteAudio').src = originalURL; el('originalNoteAudio').hidden = false;
    status('Ready. Choose the languages and confirm audio processing.'); refresh();
  } catch (error) { status(error.message); }
}
el('voiceNoteFile').addEventListener('change', e => { void selectFile(e.target.files?.[0]); });
el('voiceNoteConsent').addEventListener('change', () => {
  if (!el('voiceNoteConsent').checked) { invalidate(); status('Processing cancelled. Confirm again to translate.'); } refresh();
});
for (const id of ['voiceNoteSource','voiceNoteTarget']) el(id).addEventListener('change', () => { invalidate(); status('Language changed. Tap Translate voice note to translate again.'); });
el('clearNote').addEventListener('click', clearNote);
el('cancelNote').addEventListener('click', () => { invalidate(); status('Cancelled. Your selected note is ready to try again.'); });
el('translateNote').addEventListener('click', async () => {
  if (!selectedFile || !el('voiceNoteConsent').checked) return;
  invalidate(); const version = generation; controller = new AbortController(); refresh(); el('cancelNote').hidden = false;
  const sourceLanguage = el('voiceNoteSource').value, targetLanguage = el('voiceNoteTarget').value;
  try {
    const result = await translateVoiceNote(selectedFile, { sourceLanguage, targetLanguage, consent: true, signal: controller.signal,
      onStage: text => { if (version === generation) status(text); },
      onTranscript: text => { if (version === generation) { el('noteResults').hidden = false; el('noteTranscript').textContent = text; } },
    });
    if (version !== generation) return;
    translatedText = result.translation; selectedLanguage = targetLanguage;
    el('noteResults').hidden = false; el('noteTranslation').textContent = translatedText;
    el('translationHeading').textContent = `Translation · ${VOICE_NOTE_LANGUAGES[targetLanguage]}`;
    el('copyNoteTranslation').disabled = el('playNoteTranslation').disabled = false;
    status('Translation ready. Review the important details against the original voice note.');
  } catch (error) {
    if (version === generation) status(error.name === 'AbortError' ? 'Processing cancelled. You can try again.' : error.message);
  } finally { if (version === generation) { controller = null; el('cancelNote').hidden = true; refresh(); } }
});
el('copyNoteTranslation').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(translatedText); status('Translation copied.'); }
  catch { status('Copy is unavailable here. Select and copy the translation text.'); }
});
el('stopNotePlayback').addEventListener('click', stopPlayback);
el('playNoteTranslation').addEventListener('click', async () => {
  if (!translatedText) return;
  stopPlayback(); const version = generation; const playback = new AbortController(); playbackController = playback;
  el('stopNotePlayback').hidden = false;
  try {
    for (const text of splitPhrases(translatedText, 2400)) {
      const timeout = AbortSignal.timeout(15_000);
      const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, language: selectedLanguage }), signal: AbortSignal.any([playback.signal, timeout]) });
      if (!r.ok || !r.headers.get('content-type')?.startsWith('audio/')) throw new Error('Playback is unavailable. You can still read or copy the translation.');
      const blob = await r.blob(); playback.signal.throwIfAborted();
      if (version !== generation) return;
      if (outputURL) URL.revokeObjectURL(outputURL); outputURL = URL.createObjectURL(blob);
      const audio = el('translatedNoteAudio'); audio.src = outputURL; audio.hidden = false;
      await new Promise((resolve, reject) => {
        const cleanup = () => { audio.onended = audio.onerror = null; playback.signal.removeEventListener('abort', cancelled); };
        const cancelled = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
        audio.onended = () => { cleanup(); resolve(); }; audio.onerror = () => { cleanup(); reject(new Error('Could not play this audio.')); };
        playback.signal.addEventListener('abort', cancelled, { once: true });
        audio.play().catch(error => { cleanup(); reject(error); });
      });
    }
  } catch (error) { if (version === generation && !playback.signal.aborted) status(error.message || 'Playback is unavailable.'); }
  finally { if (playbackController === playback) stopPlayback(); }
});
window.addEventListener('pagehide', clearNote);
async function receiveShare() {
  const hash = new URLSearchParams(location.hash.slice(1)), token = hash.get('share');
  const sharedError = hash.get('share-error');
  if (!token && !sharedError) return;
  history.replaceState(null, '', location.pathname);
  if (sharedError || !('serviceWorker' in navigator)) { status('The shared file could not be opened. Save the note and choose the audio file here.'); return; }
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Sharing is unavailable. Save the note and choose the file here.')), 4000)),
    ]);
    const file = await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Sharing timed out. Save the note and select the audio file here.')); }, 4000);
      channel.port1.onmessage = e => { clearTimeout(timer); channel.port1.close(); e.data?.file ? resolve(e.data.file) : reject(new Error('The shared note expired. Share it again or select the saved file.')); };
      reg.active.postMessage({ type: 'voice-note-share', token }, [channel.port2]);
    });
    await selectFile(file);
  } catch (error) { status(error.message); }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(() => receiveShare()).catch(() => status('You can choose a saved voice note here. Direct sharing is unavailable.'));
}

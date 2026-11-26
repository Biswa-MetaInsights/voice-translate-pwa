import { voiceNoteMime, VOICE_NOTE_MAX_BYTES } from '../../lib/voice-note-format.js';
export function sharedAudioFile(payload) {
  if (!payload || typeof payload.base64 !== 'string' || payload.base64.length > Math.ceil(VOICE_NOTE_MAX_BYTES / 3) * 4 ||
      payload.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(payload.base64) || /=/.test(payload.base64.slice(0, -2))) {
    throw new Error('The shared note is invalid or larger than 4 MB.');
  }
  const raw = atob(payload.base64), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (!bytes.length || bytes.length > VOICE_NOTE_MAX_BYTES) throw new Error('Choose a voice note smaller than 4 MB.');
  const mime = voiceNoteMime(bytes.subarray(0, 512), bytes.length);
  return new File([bytes], 'shared-voice-note', { type: mime });
}
export function applySharedFile(file, input) {
  const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Shared by the file picker and server. File bytes decide the format; names and MIME alone do not.
export const VOICE_NOTE_MAX_BYTES = 4_000_000;
export const VOICE_NOTE_ACCEPT = '.opus,.ogg,.m4a,.mp3,.wav,.webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/webm';
export const VOICE_NOTE_LANGUAGES = {
  'ar-SA': 'Arabic', 'en-US': 'English', 'fr-FR': 'French', 'nl-NL': 'Dutch',
  'de-DE': 'German', 'hi-IN': 'Hindi', 'ml-IN': 'Malayalam', 'ta-IN': 'Tamil', 'es-ES': 'Spanish',
};
const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));
export function voiceNoteMime(bytes, size = bytes.byteLength) {
  if (!Number.isInteger(size) || size < 12) throw new Error('This audio file is empty or incomplete.');
  if (size > VOICE_NOTE_MAX_BYTES) throw new Error('Choose a voice note smaller than 4 MB.');
  if (ascii(bytes, 0, 4) === 'OggS') {
    if (!ascii(bytes, 0, 512).includes('OpusHead')) throw new Error('This OGG file does not contain supported Opus audio.');
    return 'audio/ogg';
  }
  if (ascii(bytes, 0, 3) === 'ID3' || bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0) return 'audio/mpeg';
  if (ascii(bytes, 4, 8) === 'ftyp') return 'audio/mp4';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') return 'audio/wav';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'audio/webm';
  throw new Error('Unsupported audio. Choose an Opus/OGG, M4A, MP3, WAV or WebM voice note.');
}

import { createVoiceNoteHandler } from '../lib/voice-note/handler.js';
import { transcribeVoiceNote } from '../lib/voice-note/transcription.js';
// Web-standard Request preserves the original bytes; no multipart parser or file storage.
export const maxDuration = 45;
export default { fetch: createVoiceNoteHandler({ transcribe: transcribeVoiceNote }) };

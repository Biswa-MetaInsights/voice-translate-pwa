import { createVoiceNoteHandler } from '../../../lib/voice-note/handler.js';
import { transcribeVoiceNote } from '../../../lib/voice-note/transcription.js';
import { withMobileUpload } from '../../../lib/mobile/access.js';
export const maxDuration = 45;
export default { fetch: withMobileUpload(createVoiceNoteHandler({ transcribe: transcribeVoiceNote })) };

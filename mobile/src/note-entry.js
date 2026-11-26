import { initializeMobile, receivePendingAudio, showStartupError } from './runtime.js';
import { finishNotePresentation } from './presentation.js';
try { await initializeMobile(); await import('../../src/voice-note.js'); finishNotePresentation(); await receivePendingAudio(true); }
catch { showStartupError(); }

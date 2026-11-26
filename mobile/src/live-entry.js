import { initializeMobile, showStartupError } from './runtime.js';
try { await initializeMobile(); await import('../../src/main.js'); }
catch { showStartupError(); }

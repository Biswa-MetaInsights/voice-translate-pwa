# Selected WhatsApp voice notes: implementation and release plan

## Customer scope

Al Noor's clarified requirement is a person selecting an Arabic voice note in WhatsApp, sharing/opening that individual note in VoiceTranslator.eu, and translating it. The flow implemented here supports that user-selected file. No business number, message webhook, WhatsApp Cloud API, Meta access token, or database is involved. The earlier Cloud API experiment is on a separate worktree and is excluded from this branch.

## Architecture

WhatsApp Share / saved audio → `/voice-note.html` → explicit processing agreement → `/api/transcribe-audio` → existing AI Gateway speech provider → original transcript → existing `/api/translate` → translation shown beside original. Playback uses the existing `/api/speak` only after the user asks to listen.

- The homepage links to the voice-note screen in a separate tab. Microphone, Meeting audio, Conversation mode, existing translation, TTS and MP3 source code are unchanged.
- Android: the installed PWA registers an audio `share_target`. The service worker intercepts the multipart POST locally and holds one file under a random, single-use token. It redirects to the voice-note screen; that screen claims the file through a message channel. The file is never uploaded automatically.
- Phone sharing is platform-dependent. WhatsApp's Forward action targets WhatsApp recipients; this feature uses the system Share action. Where VoiceTranslator is absent from the share sheet, users save the note and select it through the file picker. iPhone's supported baseline for this release is the saved-file picker; a native Share extension is a separate future implementation.
- PWA share handoff uses memory only: two-minute TTL, at most three pending files. A stopped service worker discards pending files and the UI gives a file-picker fallback. No audio is placed in Cache Storage, IndexedDB, localStorage, query strings, analytics or logs.
- The page holds the note and results in memory; Clear and pagehide cancel work, revoke object URLs and release file/result references. A provider cannot necessarily cancel processing already received; browser cancellation prevents a late result from updating the page.
- The API accepts raw audio bytes, never media URLs. There is no URL fetch/SSRF surface. Both sides sniff file headers and limit encoded bytes to 4,000,000 (below the normal Vercel request limit). Supported containers: Opus in OGG, M4A/MP4, MP3, WAV and WebM. Header sniffing is not a full codec validation; the bounded, timed speech provider performs decoding.
- The server does not write files or persist transcripts/results. Its audio buffers are overwritten when the request finishes; JavaScript strings and SDK copies are garbage-collected, so immediate physical erasure cannot be guaranteed. Cloud provider processing/retention terms still apply.
- Transcription has a 35-second request budget, no automatic provider retries, and a five-minute duration limit when the provider returns duration. The output transcript is capped at 12,000 characters. Duration metadata is only available after transcription: the byte cap and timeout bound ingestion/processing beforehand. Translation is split into complete phrases below the existing route limit.
- No numeric confidence score is invented. Every result asks the user to check names, dates, times and instructions against the original. The existing translation language guard is retained. If the translation reports ambiguous meaning, no completed translation is presented.

## Configuration and preview

1. Start from this branch based on main commit `3366b5b` (Conversation handoff included). No new runtime packages are needed.
2. Set `VOICE_NOTE_UPLOAD_ENABLED=true` in **Preview** only. The default is disabled. Keep the existing server-only `AI_GATEWAY_API_KEY` or Vercel runtime identity. The model defaults to `openai/whisper-1`; `VOICE_NOTE_TRANSCRIPTION_MODEL` is an operator-controlled override. Verify file-transcription model availability in the actual Gateway account before customer testing.
3. Build with `npm run build`. `vite.config.js` builds both the homepage and voice-note page. Vite dev/preview alone does not run Vercel API routes; use the Vercel local runtime or a preview deployment for real provider tests.
4. Configure a platform rate limit for `/api/transcribe-audio` and a Gateway budget before public activation. The code's six requests/minute/IP and two simultaneous requests are **per warm instance only**, not a durable/global rate limit. Keep request-body logging and session replay off for the upload and result page; restrict infrastructure log access. This page does not load web analytics.
5. Verify existing live and conversation flows in the preview before promotion. Test on real Android with WhatsApp sharing and on iPhone with Save to Files / file picker. Existing PWA installations may need a manifest refresh/reinstall before a new share target appears.
6. Use only approved, non-sensitive Arabic sample notes for provider validation. Agree sample expectations with Al Noor: accents/noise, numbers, names, dates, times, negation and instructions. Record word/detail accuracy and latency; require human review of important details. Synthetic/mocked checks establish integration behavior, not speech accuracy.
7. Review the updated privacy notice, company DPA/subprocessors, lawful basis and cross-border transfer settings before sensitive customer audio. This code does not train a model on uploaded notes; the company must confirm upstream contractual terms rather than claim legal compliance from code.
8. Only promote after preview acceptance and explicit production deployment authorization. Rollback is the prior deployment; independently disable new file transcription by setting `VOICE_NOTE_UPLOAD_ENABLED=false`.

## Verification

`npm test` runs existing regression checks plus upload consent/origin/type/size/timeout limits, buffer cleanup, error redaction, Arabic transcription fixtures, complete translation chunking, cancellation, and the service-worker single-use/expiry/size/cross-origin handoff tests. Tests mock the speech/translation providers. Real WhatsApp OS sharing and real Arabic recognition remain acceptance gates, not inferred results of unit tests.

The original business-number Cloud API queue/worker and Supabase migration are not part of this release.

## Primary references checked 26 November 2026

- https://developer.chrome.com/docs/capabilities/web-apis/web-share-target
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target
- https://vercel.com/docs/functions/runtimes/node-js
- https://ai-sdk.dev/docs/ai-sdk-core/transcription

Optional Chromium UI checks are in `scripts/check-voice-note-browser.mjs`. With Playwright installed in your QA environment, run `node scripts/check-voice-note-browser.mjs`. It starts a local Vite server, mocks provider routes, checks the mobile upload/consent/result/clear flow and existing mode controls, and exercises a real service-worker multipart handoff. `VOICE_NOTE_PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH` can select an existing QA installation; no browser-testing package is added to the app runtime. This is a browser integration check, not an Android/iOS hardware or real speech-model evaluation.

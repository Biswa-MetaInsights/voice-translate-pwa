# VoiceTranslator native apps — development milestone

This directory contains Android and iPhone apps built with Capacitor **8.6.3**. It reuses the existing Vite UI, live transcription, ordered streaming translation, Conversation mode and voice-note pipeline. Native code supplies audio receiving and the system MP3 export sheet. It does not enable or modify the preserved Meta Cloud API experiment.

The mobile presentation layer uses familiar messaging patterns with VoiceTranslator branding: readable text, quiet surfaces, green primary actions, simple bottom navigation and a translation-first result. The original words are expandable. Website installation/marketing cards and diagnostics are removed from the native screen; processing consent and privacy controls stay visible. Layout review covered 320 px and 390 px frames, normal and 200% root text, language selection, privacy/help and the entry to Conversation mode. This is browser layout verification, not a claim of native-phone or nontechnical-user acceptance.

## Isolation from the live PWA

- Work branch: `feat/mobile-apps`, based on selected-note branch `77b5aa0` (which includes main `3366b5b`). The selected-note change remains a separate dependency, not a production merge.
- Existing `src/`, `public/`, HTML, root package/config and original API handlers are unchanged. Native-only transformations happen during the mobile build. The PWA continues to build normally.
- The app contains **bundled web assets**, not a remotely loaded `server.url`. Mobile and web are independently released. No service worker or web analytics is enabled in the native build.
- Added `/api/mobile/v1/*` adapters are disabled unless `MOBILE_API_ENABLED=true`. They reuse existing handlers; the original web upload keeps its existing origin protection.
- A mobile test build requires an explicit separate HTTPS backend. Production host selection requires `MOBILE_ALLOW_PRODUCTION_BACKEND=true`. That is an acknowledgement in the build tool, not authorization to deploy.
- Once launched against production, mobile users add provider requests and cost. Configure shared capacity, budgets and durable rate limits before release; software isolation cannot guarantee zero load impact.

## Implemented scope and remaining verification

| Capability | Current implementation | Acceptance still needed |
| --- | --- | --- |
| Live microphone, language selection, streaming translation, speech, Conversation mode | Bundled existing interface and services | Android/iOS WebView microphones, codecs, permission refusal, interruption and latency |
| Android audio share | `ACTION_SEND`, single user-granted `content://` URI, memory-only handoff to voice-note screen | Real WhatsApp cold start/warm start, multiple notes, provider timeouts, Opus/M4A |
| iPhone audio share | Embedded Share Extension translates inside the share sheet; Arabic dialects, English, French, Dutch, German, Hindi, Malayalam, Tamil | Xcode compilation, actual WhatsApp UTI types, extension memory/time budget and device speech |
| MP3 export | System Save/Share sheet using app-private temporary cache | Real Android/iPhone receiving apps and cancellation |
| Desktop Meeting audio | Existing feature remains in the PWA; device capability detection disables it on unsupported mobile WebViews | Do not advertise phone/system-call audio capture |
| Payments, background listening, push, account sync | Not implemented in this milestone | Separate product scope and store policy decisions |

**Android debug/test APKs and an unsigned release AAB now compile locally.** JDK 21 and Android SDK 36 were installed after the company authorized SDK license acceptance. Device/emulator execution, real WhatsApp sharing, final company signing and store approval remain outstanding. There is no local KVM device for accelerated emulator tests, and no Apple Xcode/macOS toolchain. No app has been submitted or deployed. See `PLAY-RELEASE.md` for the release workflow and `PLAY-STORE-READINESS.md` for the audit and progress.

## Local preparation

1. Run `node mobile/scripts/install-shared.mjs` to install the reviewed mobile shared-dependency snapshot without imposing a root lockfile on the PWA. Run `npm test` and `npm run build` for the regression baseline.
2. In `mobile/`, run `npm ci`. Native dependencies are pinned in `package-lock.json` independently of the PWA.
3. Prepare the isolated backend with `node mobile/scripts/prepare-backend.mjs` after the mobile build, then deploy its generated directory only when authorized. Apply and verify the mobile control migration and hourly retention job in the selected test database first. Set the server-only variables from `.env.example` and `PLAY-RELEASE.md`. Missing distributed admission configuration fails closed. Never put Gateway/Meta/database secrets in app configuration or embed deployment-bypass secrets.
4. Set `MOBILE_BACKEND_ORIGIN=https://YOUR-MOBILE-PREVIEW.vercel.app` in the shell. `mobile/.env.example` documents names; the build reads shell variables and does not automatically load `.env` files.
5. Run `npm run build`, then `npm run sync`. Build writes public backend configuration to bundled assets and the extension's generated `Backend.plist`. Sync retains our native source and embedded extension target. `npm run icons` regenerates checked-in native artwork from the existing vector logo.
6. Android: install the Capacitor 8 toolchain (JDK 21, Android Studio, SDK 36). Run `npm run android`, then install a debug build on a device. The app requests microphone permission when recording starts, with no broad storage/contact permissions.
7. iPhone: use macOS and Xcode 26 or later. Run `npm run ios`. Choose the correct Apple team for **both** `eu.voicetranslator.app` and `eu.voicetranslator.app.VoiceNoteShare`, or update both bundle IDs together before signing. The initial deployment target is iOS 18; older iOS versions have not been validated for the existing web audio/AbortSignal features.
8. `npm test` in `mobile/` checks API gating/preflight, consent/type/size enforcement, retained streaming/cancellation, backend validation, native audio decoding, overlapping native share events, safe disposal, redacted fallbacks, and export boundaries. `node scripts/check-browser.mjs` exercises the built mobile interface with fixture responses; it does not emulate the native share sheet or evaluate speech accuracy.

The optional **manual** GitHub workflow `mobile-validation.yml` compiles Android debug/test APKs, runs lint, compiles an unsigned validation AAB, and runs instrumentation on an emulator. Its separate iOS job compiles an unsigned simulator build. It does not deploy APIs or submit to stores. The workflow itself has not been run; local Android compilation is separate evidence.

## Mobile API compatibility

The first public mobile contract is `/api/mobile/v1/`. The adapter emits `X-VoiceTranslator-API-Version: 1`. Changes to v1 must be additive and retain existing required fields, error/status behavior and streaming events. Breaking changes require a new API version and an overlap period for installed app versions. Versioning is an engineering contract; the path alone cannot prevent future incompatible handler changes, so contract tests must stay part of review.

## Audio sharing behavior

Android: select one WhatsApp voice note → system Share → VoiceTranslator → select languages → confirm processing → Translate. A warm app navigates to its voice-note screen. A cold app consumes its original intent once. The incoming file is read on a background thread, limited to 4,000,000 bytes, kept for at most two minutes while the process lives, consumed once, and never uploaded automatically. New pending shares replace older ones. Only `content://` references are opened; arbitrary network/file URLs are rejected. File content is sniffed again by JS and the server. Android content providers can block during I/O; hostile/provider-stall behavior remains a device/fuzz test gate.

iPhone: select one note → Share → VoiceTranslator → confirm processing → translation displayed **within the extension**, with optional device speech. It does not force-open the containing app with undocumented APIs. The extension reads the provider's temporary file during its callback, caps it at 4 MB, and keeps app-owned audio/transcripts/results in memory. It does not create an App Group inbox. MIME detection, transcription, translation language validation and ambiguity rejection all run before a completed translation is shown. Real WhatsApp file-type identifiers need device verification; a missing share option falls back to importing a saved file into the full app.

## Privacy, access and retention

No source note or transcript is written to an app database, logs, analytics or shared storage. Native bridge diagnostics are disabled. Android app backup is disabled. Source note and result references are cleared on leaving the note page/extension. Java/JS/Swift allocation copies and upstream processing cannot promise immediate physical erasure; cloud retention terms must be confirmed by the company.

An explicit **MP3 export** is different: the user requests a file for saving/sharing. It is written to private OS cache, at most 6 MB per export, with an opaque name. Copies older than ten minutes are deleted while the app runs and on the next foreground/start. If the app is terminated, deletion waits until it next runs or the OS clears cache; do not claim an absolute ten-minute deletion guarantee. Files saved/sent by the user remain in their selected destination. Android's FileProvider exposes only that export cache subdirectory, never broad storage.

Only the two exact native origins are allowed by the mobile CORS adapter. CORS and a public app identifier are **not authentication**. Endpoints must have deployment-level throttling, provider budgets and abuse controls before public access. Paid-account access/attestation is future work if required by the commercial model. Tokens for upstream providers remain server-side except the existing short-lived live-transcription session token required by the client.

The app supplies a processing notice before shared-note upload. The extension contains a readable privacy summary and company contact. Review the full published notice, lawful basis, DPA, subprocessors, retention/cross-border settings and incident/deletion support before sensitive customer notes. Apple privacy manifests include no tracking and the Filesystem plugin's file-timestamp reason `C617.1`; collected-data declarations and Play Data Safety/App Store privacy answers **require company/provider review** and are not store-submission-ready merely because a manifest exists.

## Release gates

1. Native compilation and simulator/emulator tests; native startup/share-permission tests.
2. Dedicated backend smoke tests with approved non-sensitive notes; no production switch.
3. Real Android and iPhone matrix: WhatsApp cold/warm share, unsupported/broken/oversized files, cancellation, no network, expired service access, microphone denial, phone lock/interruption, clear/relaunch, TTS and MP3 destinations.
4. Arabic dialect/English evaluation agreed with Al Noor, including names, numbers, negation, dates and instructions. Fixture tests do not measure recognition accuracy.
5. Company developer accounts, final signing identities, privacy/store disclosures, screenshots and support/deletion information. Any future digital subscriptions need a separate store billing design.
6. Explicit authorization for test distribution and subsequent store submission. Store acceptance is not guaranteed.

## Official references checked 26 November 2026

- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/config (bundled assets; `server.url` is not a production deployment mechanism)
- https://capacitorjs.com/docs/apis/share
- https://capacitorjs.com/docs/apis/filesystem (Apple file-timestamp reason)
- https://developer.android.com/develop/ui/compose/sharing/receive
- https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html
- https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html

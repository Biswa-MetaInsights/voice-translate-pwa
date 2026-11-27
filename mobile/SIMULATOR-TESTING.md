# Android simulator testing

Run the `Mobile validation` workflow on `feat/mobile-apps`, or connect an Android SDK 36 emulator and run `./gradlew :app:connectedDebugAndroidTest` from `mobile/android` after the mobile build/sync and native build. CI runs on Android 16. Scope the task to `:app` so generated dependency modules do not run unrelated instrumentation suites.

## What the installed-app tests exercise

| Case | Expected behavior |
| --- | --- |
| Startup | Bundled UI loads; first live capture requires agreement; Cancel leaves capture off; report text starts disabled |
| Share registration | Supported audio intents resolve to the app; unrelated text does not; no broad storage/contact permissions |
| Cold audio share | Real content URI is read by the native receiver, reaches the note screen, and a synthetic WAV decodes in the WebView |
| Warm and second share | An existing Speak screen opens Voice notes; a second OGG/Opus note replaces the first and resets consent; WebView decodes Opus |
| Consent and clearing | Translate stays disabled until agreement; selection/agreement alone does not start processing; Clear releases selected file, playback URL and choice |
| Unsafe inputs | MIME-spoofed bytes, files over 4 MB, multiple attachments and external HTTP URLs are rejected without usable translation content |
| Activity recreation | A consumed note is not imported again after activity recreation |
| Simulated provider failure | An explicit test-only 503 response recovers without fabricated output or automatic retry |
| Cancellation | An explicitly simulated pending request is aborted; no stale result is shown |
| Small-screen feedback | Unsupported-share, service-failure and cancellation messages appear inside the viewport above the fixed navigation |

Tests generate PCM silence and contain a tiny FFmpeg-generated OGG/Opus silence fixture. They contain no recorded people or WhatsApp message content. Files are written only to the existing app-private export-cache subtree for the test, read through the production FileProvider/receiver, then deleted. Production APK/AAB assets do not include instrumentation code or fixture bytes.

The product intentionally uses `preload=none` for the original note. Decoder checks explicitly request local-blob metadata loading in the test, without playing or uploading the audio. They do not assert that selecting a file automatically loads it.

The intent is sent by the test application context, using the same app-owned provider. This exercises native URI reading and WebView handoff; it does **not** establish WhatsApp's actual Share-menu behavior or another application's cross-UID permission grants. The failure/cancellation responses are injected only into that test's WebView. No real backend, speech provider, Meta API or real message is contacted. Synthetic silence is a decoder fixture, not a speech-accuracy sample.

## Evidence

The Actions run linked from draft PR #18 records pass/fail results for the exact commit. The `android-validation-not-for-store` artifact contains HTML instrumentation reports, build outputs and synthetic-content emulator screenshots under `simulator-evidence`. Artifacts expire after seven days. A screenshot demonstrates only the state captured; it is not Play Store approval or a completed accessibility review.

The earlier baseline [run 45910601281](https://github.com/Biswa-MetaInsights/voice-translate-pwa/actions/runs/45910601281) passed 144 JavaScript tests and four Android instrumentation tests, plus Android and iOS builds. That run predates the expanded share-flow tests; consult the current PR/run for their actual results.

Real-phone WhatsApp sharing, hosted-backend integration, live microphone/provider speech, Arabic translation quality, interruption recovery, performance, accessibility and Play-generated release splits still require separate acceptance testing. An unsigned simulator build cannot close those gates.

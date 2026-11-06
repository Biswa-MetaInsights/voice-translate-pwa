# VoiceTranslator live verification — 6 November 2026

## Outcome and release state

The November 5 automatic detection, translation streaming and natural voice paths are active at https://www.voicetranslator.eu/. Later timing and reliability changes are also observable. Two additional frontend defects were reproduced and fixed locally, with regression tests. Nothing was merged, pushed, deployed or reconfigured during this verification.

Code basis: main `533ef4bb720bcbfd55c174e855b764c79ed84f7a`, which includes the requested November 5 commit `e6f51f4942e188adca9cc0aca41c47d819dceffb`, plus merged PRs #5 and #6. The existing QUALITY.md/PERFORMANCE.md descriptions of those earlier changes as pending release are historical; Git history now shows them merged. This report records new observations rather than treating those descriptions as current deployment proof.

## Implementation versus live deployment

The fresh public page loads `/assets/index-B7UOMYgC.js`. Its code includes the automatic language picker, realtime multilingual capture, streamed translation client, nearby-speaker controls, natural/device voices and the later session-owned cleanup and download cancellation logic. Public translation responses include the newer `start` event and per-attempt timing schema from PR #5. The two defective code paths described below were directly found in this public bundle as well as in main.

Exact deployment SHA remains unverified. GitHub reports a successful Vercel status for main, but that alone does not prove a production domain mapping. Vercel deployment history returned 403; project/environment metadata and the status-linked deployment lookup returned 404 under the explicit known team/project. No Vercel CLI was installed for the mapped fallback. A different local bundle hash is not proof of a source mismatch: the repository has no dependency lockfile and dependency ranges were resolved locally. Installed/offline PWA caches on real users' devices were not inspected.

## Live checks

| Area | Observed result | Limit |
| --- | --- | --- |
| UI | Automatic input, disabled swap in automatic mode, language picker and accuracy/voice/microphone controls present | Cloud desktop browser only; no actual microphone input |
| Multilingual streaming | Seven existing synthetic benchmark cases completed successfully; no fallback resets | Small diagnostic sample; microphone excluded |
| Automatic detection | A separate seven-case run using `sourceLanguage: auto` correctly returned Dutch, French, German, Malayalam, Arabic, Filipino and mixed French/English | Text-input detection, not a human speech/accent benchmark; Arabic regional label does not certify dialect |
| Meaning | Checked negation, Dutch 2:30, French November 12 at 15:30, fifteen versus fifty euros, Malayalam tomorrow at 10, Arabic/Filipino booking changes and not inviting Paul | Semantic spot check, not native-speaker certification |
| Incremental output | Automatic-mode probes emitted 8–19 progress callbacks before completion | Confirms stream delivery to the client, not mobile screen rendering latency |
| Production speech token | POST returned 200 with a nonempty ephemeral token and URL | No token content was logged or persisted |
| Natural voice | French synthetic input returned 200, audio/mpeg, 54,912 bytes; ffprobe confirmed MP3, mono, 24 kHz, 3.432 seconds | Media generation/decoding, not iPhone speaker playback or subjective pronunciation |
| Speech recognition | Generated French audio was decoded to 24 kHz PCM and passed to the real realtime recognizer in automatic mode; final text: “Bonjour La réunion est demain à quinze heures trente.” | Synthetic clean audio bypasses physical microphone, echo, accents and permission handling |
| Recovery | Existing tests for stall decisions, owned cleanup, restart/stop races, stale callbacks, interrupted downloads and cancellation pass | Recovery on a physical device or weak network is still unverified |

## Timing results

The reproducible timing run is saved in `benchmarks/2026-11-06-live-verification.jsonl`. It uses one fetch connection pool, the accurate quality mode and seven synthetic cases, through this workspace's outbound proxy.

| Request | First translated text | Completion | Handler total |
| --- | ---: | ---: | ---: |
| First observed / Dutch | 7.634 s | 7.856 s | 1.439 s |
| French | 1.197 s | 1.438 s | 1.314 s |
| German | 1.049 s | 1.334 s | 1.223 s |
| Malayalam | 0.930 s | 1.211 s | 1.101 s |
| Arabic | 2.866 s | 2.874 s | 2.766 s |
| Filipino | 1.068 s | 1.347 s | 1.225 s |
| Mixed French/English | 3.253 s | 3.511 s | 3.401 s |

The first request had 6.417 seconds outside the reported handler duration; later requests had approximately 0.108–0.124 seconds. The early start event arrived before translated text. These observations confirm streaming and a substantial first-request residual on this test route; they do not uniquely attribute that residual to platform cold start, proxy/TLS, routing or other stages. The separate semantic run also encountered several long transport-inclusive requests. No guarantee of 1–2 second response, removal of the old 20.67-second outlier, reliable p95 or mobile end-to-end latency is justified. No model downgrade, prewarming or region change is proposed.

## Confirmed defects and proposed changes

1. **Compatibility speech drops simultaneous interim text.** A Web Speech result event can contain a finalized sentence followed by an unfinished next phrase. The existing final branch clears the interim transcript and ignores the unfinished text. Stopping at that point loses those words. The fix queues finalized text, then retains and previews the event's interim text. A regression checks the combined visible transcript and preservation/queueing of the unfinished phrase on stop.
2. **Stale realtime frame changes newer session state.** The existing stream loop marks recognition healthy and resets retry counts before checking session ownership. A late old transcript can overwrite a newer session's diagnostics/retry budget even though transcript text itself is correctly ignored. The fix checks ownership before any event side effects. A regression releases an old frame after a new session starts and confirms retry count, diagnostics and transcript remain unchanged.

Both defects reproduce against the unmodified current main and both corresponding implementations are present in the fetched live bundle. They were not reproduced using a physical microphone. The fixes change only `src/main.js` plus regression tests; they do not alter prompts, models, credentials or infrastructure.

## Preview speech-token investigation

The existing PR #6 preview was obtained from its Vercel GitHub comment:
https://voice-translate-pwa-git-fix-voice-session-r-74d3ac-metainsights.vercel.app

A single POST to its token route returned HTTP 503 with `code: gateway_token_failed` and safe `upstreamStatus: 403`. The equivalent production route returned HTTP 200. This confirms a current preview-specific upstream rejection rather than a general production speech outage.

The route chooses `AI_GATEWAY_API_KEY` before environment/runtime OIDC. This is consistent with the previously documented environment-restricted credential problem, but current key scope could not be independently inspected because environment metadata access was denied/not found. No credential was decrypted, copied, broadened or printed; production ephemeral tokens were used only with their intended speech gateway for the authorized synthetic recognition test.

Proposed configuration work, after access and approval: inspect credential/environment metadata without values; verify preview authentication for transcription-token minting; use a separate preview-scoped credential or a verified supported preview OIDC path. Preserve the production credential's scope. Then repeat one token request and the synthetic recognition check on that preview. There is no basis for changing production configuration now or claiming preview is fixed.

## Local validation and remaining release gate

- Before changes: 38 tests passed and Vite build succeeded.
- Both new regression tests failed against main with the expected dropped phrase / reset retry count.
- After changes: 40 tests passed, zero failures; Vite production build succeeded. Existing non-fatal dependency annotation warnings remain.
- `git diff --check` passed.
- Tests use mocks for session/event edge cases and do not certify human-language accuracy.

Remaining physical-device checks: iPhone Safari and installed PWA microphone permission; stop/start and interruptions from calls/Bluetooth; suspended AudioContext and audio-route recovery; speaker echo and playback activation; weak/offline/reconnected mobile data; accents, long sessions and code switching; stale PWA cache/update behavior. Nearby mode does not isolate overlapping speakers. Phone-lock/background listening is not guaranteed.

The local branch `fix/live-validation-followups` contains the reviewable changes. It has not been pushed: the repository's Vercel integration can automatically deploy non-main pushes, and this request requires explicit approval before deploying. First approval should cover publishing the fix PR and its automatic preview build. Merge and production release remain separately gated after preview validation. The preview configuration issue is a separate change requiring access and review.

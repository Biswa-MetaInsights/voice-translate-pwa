# VoiceTranslator quality verification

## Checks performed on 5 November 2026

- 22 Node tests pass. They cover ordered concurrent translation, cancellation, backlog coalescing, long text without truncation, Unicode streaming, provider fallback, visible failures, input language hints, audio-stall recovery, AudioWorklet sample capture, automatic language selection and retry without replaying old speech.
- Vite production build passes.
- The deployed preview UI was checked for automatic input selection, output-language restrictions, accuracy/speed controls, natural/device voice controls and microphone profiles.
- Seven synthetic text cases returned the expected meaning on semantic spot checks: Dutch time/negation, French date/time, German numbers, Malayalam negation, Arabic booking changes, Filipino booking changes and mixed French/English. This is not a native-speaker quality certification.
- Six warm preview requests produced first text in 0.82–1.82 seconds and completed in 1.06–2.19 seconds from this test client. The initial request took 20.67 seconds at the client while server timing reported 1.31 seconds. These measurements exclude microphone capture and must not be advertised as guaranteed end-to-end latency.
- Natural voice returned MP3 audio. A generated French sample was sent through the real realtime recognizer with French language guidance; the returned transcript preserved the sentence and time.
- Production speech-token creation succeeds. Preview speech-token creation fails because the existing sensitive gateway key targets production only; its scope has not been expanded. Preview text translation and natural speech use the existing runtime credential path.

## Repeating the checks

Run `npm test` and `npm run build`. Run `node scripts/benchmark.mjs https://your-deployment.example` to review the synthetic text cases and timing metadata. Model responses are real only in this explicit benchmark; unit tests use mocks.

## Remaining validation

Real phones, human accents, weak mobile networks, long sessions, overlapping voices and native-speaker ratings still need evaluation. The nearby-speaker profile changes microphone gain; it does not isolate one chosen speaker. The browser app does not guarantee listening while a phone is locked. Natural speech coverage and pronunciation can vary by language. Runtime log access through the connected Vercel tool was denied, so no complete production error scan is claimed.

Conversation text is held in page memory. Only three bounded recent source phrases are sent as context. Timing logs contain durations and model names, not conversation text. Retrying translation rebuilds the displayed translation from the source transcript without automatically replaying its old speech.

## Performance investigation — 6 November 2026 (review only)

See [PERFORMANCE.md](PERFORMANCE.md) for public-endpoint measurements, the proxy/TLS contribution, controlled completion-tail improvement and limitations. The proposed changes pass 25 Node tests and the production build. Live deployment requires explicit approval. The benchmark now logs timings only and supports fresh curl connections or a reused fetch pool; it no longer prints translated text.

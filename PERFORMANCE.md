# Translation latency investigation — 6 November 2026

Status: review only; no live deployment or merge authorized or performed.

## What was inspected

GitHub main at `e6f51f4942e188adca9cc0aca41c47d819dceffb` (PR #4), QUALITY.md, the benchmark, translation API, provider SSE reader, client stream reader, queue and audio path. The live public endpoint was tested at `https://www.voicetranslator.eu/api/translate` using the seven existing synthetic cases. Apex redirects to www, so the measurements below use www directly.

The flow is microphone → recognition → phrase queue (two concurrent workers) → same-origin translation request → credential resolution → AI Gateway/model → SSE structured JSON → decoded translation prefix → client preview → ordered commit and speech. These text benchmarks start after recognition; capture, recognition, speech synthesis/playback and real-phone experience are excluded.

Vercel deployment-history access returned 403. No Vercel CLI is installed for the mapped fallback. Therefore the exact live deployment SHA, platform startup duration and private runtime/provider traces could not be verified. Public responses have the old timing schema; main is the code basis for this review, not a certified mapping to the live deployment.

## Measured runtime findings

All measurements ran through this workspace's outbound proxy on Node v24.22.1. These are a small diagnostic sample, not guaranteed user latency or statistically reliable population percentiles.

| Probe | First translated text | Total | Server-reported total |
| --- | ---: | ---: | ---: |
| Original fetch benchmark, first observed request | 10.753 s | 10.992 s | 1.405 s |
| Original fetch benchmark, six subsequent requests | 1.102–1.599 s | 1.336–1.956 s | 1.274–1.886 s |
| Instrumented fetch, first observed request | 6.485 s | 6.733 s | 1.023 s |
| Instrumented fetch, six subsequent requests | 1.001–1.510 s | 1.314–1.745 s | 1.230–1.545 s |
| Seven fresh curl connections | 6.552–7.757 s | 6.806–8.021 s (curl) | 1.062–1.708 s |

Fresh-connection stage ranges:

| Stage | Observed range | Interpretation |
| --- | ---: | --- |
| DNS lookup | ~0.03 ms | Workspace proxy lookup; not authoritative origin DNS |
| TCP connect after lookup | 0.29–0.86 ms | Connection to the local outbound proxy |
| TLS/proxy setup after TCP | 5.528–6.437 s | Major measured contributor on this route |
| Request-ready | 5.529–6.438 s | Cumulative connection setup |
| Response headers / first byte (curl) | 5.626–6.552 s | Cumulative; before first translated body text |
| Server first translated text | 0.800–1.381 s | Starts at handler entry, excludes earlier startup/routing |
| Server completion | 1.062–1.708 s | Includes provider attempts but old schema cannot split them |

The instrumented fetch first request has 5.710 s outside the reported handler duration. Later requests have 57–200 ms outside it. Fresh curl connections repeatedly reintroduce several seconds of setup even after prior successful translations. This is strong evidence of transport/proxy overhead in this environment, not evidence that every browser experiences a five-second handshake.

A similar first-request discrepancy was reproduced, but not the exact 20.67-second preview observation. That original event cannot be retrospectively attributed from its two timestamps. Cold initialization, edge scheduling, and gateway-internal retries remain unobservable on the old deployment. No client retries occur in the benchmark. No reset events occurred in the staged production probes, so they show no visible application fallback; internal gateway retries cannot be excluded.

Local fresh-process imports of the API took 46.99–85.68 ms across five runs. This excludes Vercel scheduling, sandbox startup and network. It does not establish production cold-start cost, but provides no local evidence for a multi-second module import bottleneck.

Raw staged results are in `benchmarks/2026-11-06-production-{fresh,fetch}.jsonl`. They contain timing metadata only. The initial original-script reproduction is summarized above; its old output included synthetic translations and was not retained as a new benchmark artifact.

## Focused code changes

1. Both stream readers now finish and cancel their reader at their explicit protocol completion marker (`[DONE]` upstream; `done` downstream), instead of waiting for connection EOF. The full structured response is still validated; incomplete streams still fail. This removes any unnecessary completion-to-close delay and releases queue capacity sooner. It cannot shorten the TLS handshake or time to first translated token.
2. Emit a content-free `start` event after validation and before credential/provider work, with `Server-Timing: handler_setup` and `no-store, no-transform`. This makes handler arrival distinguishable from first translation and discourages response transformation. Existing clients ignore unknown events. This is an observability/stream-establishment improvement; no live latency gain is claimed.
3. Record credential-resolution time, module age, first-handler-invocation marker, and per-model-attempt offset, header arrival, first body bytes, first content delta, outcome and completion. Fallback resets the final-attempt first-text timer. Errors expose safe timing metadata through the stream too. No input, context, translation, provider error messages or credentials enter timing logs.
4. Extend benchmarks with two explicit transport modes, first-body/start/text/done/EOF measurements, reset counts, safe metric allowlisting, success/failure status and small-sample summaries. Fresh curl mode separates connection stages; fetch mode permits pool reuse. First observed request is never labelled a proven cold invocation.

No translation prompts, quality modes, model order, automatic detection, context limits or audio capture behavior were changed. Conversation storage remains in memory with bounded context and no response caching.

## Controlled improvement and tests

A synthetic provider sent complete content plus `[DONE]`, then deliberately delayed connection closure by 250 ms. Three runs of the original reader took 250.61–252.49 ms. Three updated-reader runs took 0.06–0.41 ms and cancelled the stream. This proves removal of that artificial tail wait; it does not establish that the live gateway currently has such a tail. The client has a matching regression test with a stream that never sends EOF after `done`.

- `npm test`: **25 passing tests** (22 existing plus 3 new performance/privacy tests).
- `npm run build`: successful, Vite v7.3.7. Existing dependency annotation warnings are non-fatal.
- API regression checks now cover start-before-provider, per-attempt timings and fallback outcomes.
- Existing automatic detection, mixed/uncertain language handling, bounded context, Unicode, incomplete streams, cancellation, ordered concurrency, retries and audio recovery tests pass.
- Both benchmark modes are exercised against a local synthetic HTTP server, including checks that recorded output omits source, translation and secret fields.

This repository has no lockfile. Dependencies were installed with its existing version ranges; no dependency changes are proposed. Mock tests validate behavior and contracts, not native-speaker translation quality.

## Repeatable baseline and next measurement

```sh
npm test
npm run build
node scripts/benchmark-completion.mjs
node scripts/benchmark.mjs https://www.voicetranslator.eu 1 curl
node scripts/benchmark.mjs https://www.voicetranslator.eu 1 fetch
```

Requires Node with fetch/Web Streams and curl with `--write-out` timing support; local tests also require curl. Use a canonical origin without credentials/query. Each round sends seven synthetic provider requests; rounds are bounded to 1–5. Benchmark failures exit nonzero. Comparisons require the same caller, proxy route, quality, languages, deployment and connection mode. Six subsequent samples are too few for a dependable p95; summaries are descriptive only.

After approval, repeat these probes on the instrumented deployment and on an ordinary browser/mobile connection. Separate:

- client connection setup and headers from stream-start arrival;
- server authentication, model-attempt headers/body/content/complete, and fallback offsets;
- first usable translated prefix and done-to-EOF delay.

Provider attempt timings include the function-to-gateway transport, gateway routing and provider work; they are not pure model inference timings. Exact edge queue/startup time and gateway-internal retries still require platform/provider telemetry. `firstInvocation` only means first call seen by a loaded module; `moduleAgeMs` is not platform initialization duration. Do not subtract timestamps from different clocks: only compare durations, and treat outside-handler residual as an aggregate rather than a unique diagnosis.

The supported expected benefit is removal of completion-tail waits where present, earlier observable stream establishment and actionable timing attribution. A reduction of the original 20.67-second outlier is not yet verified. No model downgrade, speculative prewarming or region change is justified by these measurements.

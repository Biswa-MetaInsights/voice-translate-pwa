# Mobile engineering and release standard

The usability goal is a clear, dependable experience: the chosen note is visible, processing is explicit, progress is understandable, cancellation works, and failures give a useful next action. A familiar interface does not establish the reliability or scale of a mature messaging platform; those properties must be measured.

## Mobile interaction principles

Use familiar messaging patterns: clear headers, quiet neutral surfaces, restrained green actions, recognizable audio controls and thumb-reachable navigation. Keep VoiceTranslator's identity and avoid suggesting that the app is an official WhatsApp product. Primary buttons and selectors have at least 48 CSS pixels of height; the iPhone extension uses native controls with at least 48-point button heights and Dynamic Type. These layout choices are not a substitute for TalkBack/VoiceOver and physical-device testing.

Use everyday wording such as Choose voice note, Translate, Listen and Copy text. Show the translation first, with the original words available in an expandable section. Keep advanced settings, export-format details, web installation notices and diagnostics away from the main task. Never simplify away consent, cancellation, important accuracy guidance or useful error recovery.

At 320 px and 390 px, check wrapping and scrolling with real rendered screens. Test larger text, reduced motion, long language names and Arabic text. Before public release, observe several people unfamiliar with the app attempting the voice-note flow without coaching; record completion, confusion and mistakes rather than assuming familiarity proves usability.

## Code review expectations

- Preserve the existing live PWA and translation pipeline. Mobile-specific presentation, native bridges and API access stay behind their own boundaries.
- Keep responsibilities small and dependencies explicit. Native share coordination is a testable state machine; it never starts a translation itself.
- Keep `/api/mobile/v1/` compatible with installed clients. New required fields, changed event types, language semantics or error contracts require version planning and contract tests.
- Handle overlapping native events, stale asynchronous results, app backgrounding, missing optional plugins, denied permissions, offline states and cancellation deliberately.
- Bound input size, native pending work, transfer time and response size before allocating unbounded memory or calling a provider. Do not automatically repeat paid processing requests.
- Do not return or log raw notes, transcripts, native paths, personal filenames or credentials. Diagnostics should describe a failure category, not message content.
- Keep credentials on the server, HTTPS enforced, redirects restricted, source retention in memory, and user-requested export retention documented. Mobile dependencies and the mobile-specific shared dependency snapshot are locked; do not impose that snapshot on web deployments without review.

## Verification gates

| Gate | Required evidence |
| --- | --- |
| Shared services | Existing regression suite passes; no unintended PWA source changes |
| Mobile adapter | Contract, origin, consent, type/size, streaming, cancellation and error tests pass |
| Native integration | Android SDK compilation and iOS Xcode compilation pass; native tests actually run on emulator/simulator |
| Actual WhatsApp | Approved sample notes work on real Android and iPhone, both cold and warm starts; errors and missing share options have usable fallbacks |
| Voice quality | Arabic dialects, names, numbers, dates, negation and instructions evaluated against human-reviewed samples |
| Performance | Startup, first transcript, first translation, full note, cancellation and memory measurements recorded by device/network; release targets agreed from measurements |
| Service capacity | Global limits, provider quotas, cost budgets and load behavior verified on the test backend |
| Distribution | Signing, developer accounts, privacy/store disclosures, support/deletion details, release and rollback procedures reviewed |

JavaScript and browser fixture tests do not replace native compilation, phone testing, speech evaluation or load testing. Do not call an app store-ready until its outstanding gates pass. The manual GitHub workflow has not been run. Local Android compilation is now separate evidence; emulator/physical-device execution is still pending.

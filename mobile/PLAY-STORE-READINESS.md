# Google Play readiness audit — 26 November 2026

Decision: **NO-GO for production submission**. Audited source commit `062b46e` on `feat/mobile-apps`. This is a source/configuration and policy audit, not an installed-app certification. Google approval and failure-free operation cannot be guaranteed. No Play Console account, native binary, physical phone, or deployed mobile backend was inspected. No store submission or deployment was performed.

## Subsequent engineering progress

The findings below record the original audit. Work since that snapshot now provides:

- Local Java 21 / Android SDK 36 compilation of debug APK, instrumentation APK and unsigned release AAB; Android lint and release vital checks. SDK license acceptance was explicitly authorized by the company. These builds do not establish device execution or store approval.
- 122 existing regression tests and 22 mobile tests, including an embedded Postgres (PGlite) execution of the actual migration: rate caps, role restrictions, report constraints and expiry purge. No hosted database schema was changed.
- First-use live cloud-processing agreement, shared full policy text, in-app reporting with explicit optional-text inclusion and no automatic audio/transcript attachment; capture/cancel/report controls verified in browser DOM interactions. Screenshot capture failed in the cloud browser, so no new visual-screenshot certification is claimed.
- Mandatory distributed, rotating-pseudonym admission; global daily request cap; fail-closed database/secret errors. The prepared backend exposes only versioned mobile routes. Deployment, provider spend caps, retention Cron setup and deployed-system verification remain pending.
- Cancellable native content reads, poll-based read deadlines, declared-length bounds, explicit Android cloud/device-transfer backup exclusions, improved launcher/splash assets and monochrome icon.
- Secure signing configuration with release guards, checksummed Gradle distribution, reviewed shared dependency snapshot, patched mobile development dependencies (full mobile npm audit: zero known vulnerabilities), store icon/feature graphic, listing draft and reviewer runbook.

**Still NO-GO for production:** no working mobile deployment, hosted migration/Cron verification, company signing, organization Console verification, physical WhatsApp tests, speech-quality acceptance, executed emulator instrumentation, final privacy/provider/legal sign-off, actual Android store screenshots, Play pre-launch report or store submission. Read `PLAY-RELEASE.md` for concrete next actions. The preserved Meta integration and live PWA source remain unchanged.

## Evidence collected

- Root regression suite: 122/122 passed during this audit.
- Mobile JavaScript suite: 15/15 passed during this audit.
- Mobile `npm audit --omit=dev --json`: zero reported vulnerabilities. This excludes development dependencies, root dependencies and Gradle/transitive Android dependencies; it is not a full security certification.
- Mobile Vite build and Capacitor sync passed in the preceding UI change at the same source commit. Neither operation compiles Android Java or produces a signed release bundle.
- Android source declares min SDK 24, compile/target SDK 36, application ID `eu.voicetranslator.app`, versionCode 1/versionName 1.0.
- Source manifest requests INTERNET and RECORD_AUDIO only, disables backup and cleartext traffic, and grants narrow FileProvider cache access. Final merged manifest still requires inspection.
- Native shell bundles local assets, disables WebView debugging/mixed content and logging, and registers audio SEND intents. Java receiver accepts content URIs with a 4 MB byte bound and two-minute pending retention. JS/server independently validate audio containers.
- Shared-note translation requires explicit consent. No automatic upload on share. Analytics/feedback scripts and service-worker registration are removed from the mobile build.
- Existing live PWA source, public files and original API handlers are unchanged relative to selected-note base `77b5aa0`. Preserved Meta work is outside this release.

## Submission blockers and acceptance evidence

| ID | Finding / evidence | Required closure | Owner |
| --- | --- | --- | --- |
| A1 | Android has not been compiled here; `javac` and `sdkmanager` are unavailable. Existing manual workflow assembles debug APK and test APK only. | Run Java 21/Android SDK build; Android lint, debug build, release AAB build, dependency review, emulator instrumentation. Preserve logs and hashes tied to a commit. Compiling a test APK is not running tests. | Engineering |
| A2 | `app/build.gradle` has no release signing configuration. No signed AAB, upload certificate or Play App Signing evidence. | Establish secure upload key custody and backup; enroll in Play App Signing; sign/validate bundle outside source control. Verify package ownership, final app identity/versionCode and install/update of Play-generated split APKs. Never commit key/password. | Company + engineering |
| A3 | Built config points to `https://mobile-test.voicetranslator.eu`; no working deployment evidence. Mobile API disabled by default. | Provision independently deployed, stable HTTPS backend; enable required flags deliberately, configure AI Gateway credentials/quotas and verify every versioned route from installed release app. Do not ship a placeholder URL or Vercel sign-in wall. Verify deployment runtime compatibility and duration/body limits for upload adapter. | Engineering + deployment owner |
| A4 | CORS native-origin allowlist is not authentication. Token/translation/TTS/upload guards are process-local; they do not enforce global budgets across serverless instances. | Shared/platform throttling, concurrency and spend caps; trusted client IP handling; restricted short-lived speech tokens; test spoofed origins, quota exhaustion, load, provider outage and kill switch. Public unauthenticated app can be viable, but server secrets embedded in it cannot secure it. | Engineering |
| A5 | `runtime.js` privacy popup covers selected notes/export only. Speak and Conversation can start without a matching cloud-processing explanation. | Show a clear mobile disclosure covering microphone audio, transcript/context, translation, summary and optional TTS before first cloud processing; affirmative user control, denied-permission recovery and accessible full policy. Keep original PWA unchanged. | Engineering + privacy owner |
| A6 | Bundled `public/privacy.html` ends with unfinished legal/company/retention review instructions; mobile popup and web policy differ. | Publish a complete public HTTPS privacy notice and make the in-app notice consistent. Identify MetaInsights BV, contact, actual providers/subprocessors, purposes, local preferences, server/provider logs/retention, deletion process and export copies. Confirm DPAs, transfers and GDPR obligations with company advisers. Do not claim zero provider retention without contractual evidence. | Company/privacy + engineering |
| A7 | Mobile hides feedback form and removes feedback scripts. No dedicated in-app AI output flagging route. | Resolve applicability of Google's AI-generated content policy to translation plus summaries/TTS. Do not assume a translator exemption. Conservative release gate: implement accessible in-app output reporting, restricted review workflow and abuse handling; explicit confirmation before including sensitive excerpts, minimal retention. Email link alone does not satisfy in-app reporting if policy applies. | Product/policy + engineering |
| A8 | No native/device evidence for microphone PCM capture, cloud streaming, WebView TTS/codec support, shared-note flow or MP3 export. | Execute matrix below on exact release artifact. Add native bridge/lifecycle regression tests and deterministic failures; no mocked result may be recorded as a speech accuracy pass. | Test lead |
| A9 | Native content read has an elapsed-time check after `input.read`; opening a provider or a blocking read can hang before the check. TTL is scheduled after completion. | Harden cancellable/bounded content-provider reading; test slow, stalled and malicious providers and repeated shares. Show recovery; prevent indefinite worker occupation. This is a code-review finding, not a reproduced phone failure. | Android engineer |
| A10 | Mobile dependencies locked, shared root dependency inputs are not locked; CI uses `npm install --package-lock=false`. | Establish reproducible shared dependency resolution without unexpectedly changing the live web release. Audit root/runtime and Android transitive dependencies and build toolchain, capture SBOM/dependency output, verify no accidental secrets/debug endpoints in packaged assets. | Engineering |
| A11 | No account verification, Data safety answers, rating, audience, listing, or reviewer-access evidence. | Complete company/account tasks below and reconcile answers against deployed release behavior, including infrastructure logs and SDKs. All Console warnings must be resolved or explicitly justified before production. | Company + release owner |

## Play Console and policy requirements

Backend activation must include both `MOBILE_API_ENABLED=true` and `VOICE_NOTE_UPLOAD_ENABLED=true` for note processing, as well as working provider credentials. Enable only in the explicitly selected mobile environment after the abuse controls pass. Do not infer deployment state from a generated config file.

- Use an organization account for MetaInsights BV's company product. Verify exact legal identity, D-U-N-S/company records, organization website and required contact information according to the Console. Account status is unknown; do not assume one exists. Company representative handles agreements/payment/identity documents.
- New personal accounts created after 13 November 2023 currently need at least 12 continuously opted-in closed testers for 14 days before applying for production access. That specific rule is not a universal organization-account requirement. Confirm actual Console requirements; perform real testing regardless of account type.
- Current standard-phone target requirement is API 36. Source matches; validate built bundle. Inspect bundled native `.so` libraries/ABIs and 16 KB compatibility, and test an appropriate emulator. Java source alone does not prove transitive dependencies contain no native libraries.
- Prepare signed AAB with Play App Signing. Confirm permanent application ID before first release and increment versionCode for subsequent artifacts. Test updates preserving compatible local preferences and API contracts.
- Data safety must reflect audio, voice/sound recordings, text/content, diagnostics and infrastructure/provider metadata as actually processed. Evaluate ephemeral processing and service-provider sharing exceptions using Google's definitions; do not simply answer "no data collected" because there is no app database.
- No account creation is present. Do not invent account deletion features/claims; reassess Google's account deletion requirements if accounts are added. Provide practical privacy/deletion support now.
- Complete ads declaration, audience, content rating, app access and any applicable content declarations. No ads SDK was identified in intended mobile entries. Audit final bundle before declaring no ads. No login should mean reviewers can use the features without credentials; backend access must remain available throughout review.
- Confirm audience honestly. Work with Al Noor is not a reason to declare child-directed use or claim medical/clinical effectiveness. If children's personal data is intended, resolve the additional product, privacy and Families-policy implications before selecting audience/distributing.
- First release monetization is undecided. Do not add external subscription checkout for digital features without a separate review of applicable Play billing rules/programs. Do not advertise subscriptions that are not implemented.
- Store assets: accurate title/descriptions and support contact, 512×512 store icon, 1024×500 feature graphic and actual Android screenshots meeting current Console specifications. Existing browser mockups are design-review artifacts, not evidence of installed behavior. Show working functionality; avoid WhatsApp logos, implied Meta affiliation, guaranteed accuracy or translation of private chats in place.
- Native share import uses Android's user-initiated Share menu and requires no Meta Cloud API approval. Do not bundle/enable the preserved Meta integration for this release. Verify the exact WhatsApp share path on real phones before promising it.

## Mandatory device and service test matrix

Record device model, Android/WebView version, app versionCode/hash, backend version, network, steps, expected/actual outcome and redacted diagnostic reference for each result.

1. Clean install, first launch, repeat launch, force-stop/restart, update install; Android minimum supported version and current Android 15/16, Pixel/Samsung and at least one lower-memory device. Test Play-generated splits, not just local debug APK.
2. Microphone allow/deny/deny permanently/revoke, privacy toggle, phone call/audio interruption, Bluetooth/headset, background/lock/unlock, rotation and process death. No capture after stop, cancellation or loss of foreground. No accidental resumption/upload.
3. Speak: Arabic/English plus advertised languages, automatic detection, partial/complete sentence ordering, long sessions, pauses, switching languages, device/cloud playback and feedback-loop prevention. Conversation: both directions, Finish speaking/handoff, rapid taps, stop/summary, accurate numbers/dates/negation and no fabricated speech.
4. WhatsApp real approved sample: long press → Share → app, cold and warm launch, when another screen/session is active, consecutive shares and screen recreation. Verify URI grants, only one selected note and no upload before agreement. Forward is not the system Share menu.
5. OGG/Opus, M4A, MP3, WAV and WebM within documented bounds; source/target changes; original-text expansion; missing/silent/corrupt/truncated/mislabeled/oversized/overlong files, inaccessible/expired URIs, multiple attachments, blocked/slow content provider. Validate supported decoders in final WebView/provider, not just file magic.
6. Wi-Fi/mobile/slow/offline/handover, DNS/TLS failure, 401/403/413/415/422/429/5xx, provider/token timeout and expiry, quota exhaustion, cancellation during every stage, stale late results. No duplicate paid processing or stale translation shown as current.
7. Copy, Listen, cancel playback, MP3 generation/export/share/cancel, disk full, long-output limits; narrow URI sharing, expiry cleanup and clear-note behavior. Copies sent to another app remain user controlled.
8. TalkBack, 200% font, Arabic RTL/mixed text, long language names, small screens, gestures/back navigation, edge-to-edge/system bars, keyboard/sheets, contrast and touch targets. A bottom sheet must not lose controls behind navigation.
9. Dependency/secret scans, final merged manifest permissions, no audio/transcript/token/path in logs or crash reports; network-capture inventory of destinations; temporary/cache retention and no content in preferences/backups.
10. Native instrumentation tests plus Play pre-launch reports. Triage every crash/ANR, security/accessibility warning and unsupported device. Run a soak test and agree measured latency/memory targets; speech accuracy needs consented human-reviewed Arabic/dialect samples with zero tolerance for critical meaning reversals in the release corpus.

No row is passed merely by having test code. `ShareRegistrationTest.java` currently covers manifest resolution and limited permissions, not actual URI delivery, translation, audio quality or lifecycle recovery.

## Release sequence / exit gates

1. Resolve A3–A7/A9–A10 in isolated mobile code and test backend; keep PWA/Meta behavior intact. Make account/identity and privacy decisions in parallel.
2. Produce reproducible debug and release builds; run lint/instrumentation and inspect final artifacts. Configure signing privately once company identity/package is confirmed.
3. Obtain explicit authorization to publish branch and distribute test build. Use internal Play track, then closed testing and production-access application if required for the actual account.
4. Run device matrix and Play pre-launch report, fix all blocking findings, retest changed flows and regression suite. Store source commit/build hash/backend version and test evidence together.
5. Complete listing, privacy and Console declarations against the exact tested binary. Provide reviewer instructions: no login; internet/mic needed; Speak, Conversation, saved sample note, consent, translate/playback/clear/report. Document limits and reasonable reviewer sample.
6. Obtain explicit authorization for production submission. Submit once every blocker has signed-off evidence; use managed publishing where available to separate approval from launch. Never represent internal testing availability as production approval.
7. After approval, monitor crash/ANR rates, anonymized endpoint error/latency and spend; maintain support response, incident/deletion process, backend compatibility and kill switch. A first production release needs a controlled launch plan; do not assume first-release staged-rollout controls match update controls.

## Official sources checked

- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Review/app content/privacy URL: https://support.google.com/googleplay/android-developer/answer/9859455
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Organization identity: https://support.google.com/googleplay/android-developer/answer/13628312
- Personal account testing: https://support.google.com/googleplay/android-developer/answer/14151465
- Signing: https://developer.android.com/studio/publish/app-signing
- 16 KB support: https://developer.android.com/guide/practices/page-sizes
- Listing assets: https://support.google.com/googleplay/android-developer/answer/9866151
- AI policy: https://support.google.com/googleplay/android-developer/answer/13985936
- AI policy scope: https://support.google.com/googleplay/android-developer/answer/14094294

Recheck requirements in the actual Console immediately before upload. No account-specific eligibility or approval was established by this audit.

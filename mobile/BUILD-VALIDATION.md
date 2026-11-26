# Android engineering validation — 26 November 2026

Branch: `feat/mobile-apps`; release-hardening work follows audit commit `2edeafd`. Not a Play approval or device-execution record.

## Executed successfully

- Shared regression tests: 122 passed; mobile tests: 22 passed (144 total). Mobile tests include embedded Postgres execution of the actual migration, restricted role access, request budgets and expiry cleanup, plus generic failures without sensitive details.
- Root web build; mobile Vite build; Capacitor sync using patched Vite 7.3.8 and xcode 4.0.0. Original PWA source/package/API files remain unchanged.
- Reproducible shared install from `mobile/locks/shared-package-lock.json`; full npm audit of mobile dependencies and prepared shared/backend lock: zero reported vulnerabilities at execution time. This does not certify Android transitive dependencies or future advisories.
- JDK 21 / SDK 36 / Gradle 8.14.3 native `assembleDebug`, `assembleDebugAndroidTest`, `lintDebug`, `bundleRelease` and release vital lint. Final sequential build succeeded. Gradle distribution checksum matched official checksum.
- Release merged manifest: microphone/internet plus AndroidX's app-scoped signature permission only; release not debuggable, cleartext disabled, backup disabled, explicit backup/device-transfer exclusions.
- Inspected APK/AAB ZIP entries: zero packaged `.so` libraries; no preview fixture pages. All packaged public assets match the final mobile build byte-for-byte. A 16 KB device/emulator/Play bundle-explorer check is still required; do not equate archive inspection with runtime verification.
- Browser DOM interaction: live and Conversation start require agreement; Cancel leaves capture inactive; report details disabled until explicit selection; unselecting clears text; full policy covers live audio, summaries and report retention. No reports or speech samples were sent to real providers. Browser screenshot capture timed out, so fresh visual screenshots were not produced.
- Isolated backend's six versioned modules resolve locally. Root web routes are absent from its API directory.
- Signed-store-build guard rejects a release request without upload signing secrets; unsigned validation is explicit and separate from store readiness.

## Artifacts (local engineering outputs)

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| Debug APK | 4938990 | `f6ca8b03bad4cc60bc2c817f2e6d39ae33f16e38d61cbbd94db86cebae899ef7` |
| Instrumentation APK | 564073 | `5b5d205018271b9bd0d04e3a9f278d49b8e97cbdc0096d25f8b4941ea1e58d5d` |
| Unsigned validation AAB | 3312445 | `7dc3434025dc0224d672d9730bb028da9d9ecb87d53cc753c649b2704924184d` |

The debug APK is development-signed automatically. The AAB is unsigned: no company upload identity was created or used. The bundled backend is still the explicit test configuration; do not distribute these as a working production service.

## Remaining warnings and limits

- Android lint: zero errors, four unused-template-resource warnings (`activity_main`, generated Cordova `config.xml`, package name/custom scheme strings). No lint checks were disabled. Framework/resource lookup needs device confirmation before removing template resources solely to satisfy static analysis.
- No `/dev/kvm` is available locally. Instrumentation APK compiled, but instrumentation/emulator tests have not run here. Manual CI now includes an emulator execution step, but the workflow has not been run.
- No physical Android/WhatsApp validation, speech accuracy corpus, long-session/performance acceptance or Play pre-launch report.
- No hosted migration/Cron application or backend deployment. Database tests used local embedded Postgres, not a live Supabase deployment. Report retention and distributed admission must be verified after configuration.
- No company Play Console access/identity verification, upload signing, final Data safety/audience/AI declaration or legal/provider review. Store icon/feature graphic/listing are prepared; actual installed-device screenshots remain pending.
- No production deployment, store submission, real WhatsApp message or change to preserved Meta code.

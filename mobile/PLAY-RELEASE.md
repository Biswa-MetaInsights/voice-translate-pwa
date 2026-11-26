# Android release runbook

This runbook does not authorize publishing. Keep Play production submission separate from engineering builds.

## Reproducible build

Use Node 24, JDK 21 and Android SDK 36. SDK licenses require the company's acceptance. The mobile CLI/build dependencies and shared dependency snapshot are locked independently of the web deployment.

```sh
node mobile/scripts/install-shared.mjs
cd mobile
npm ci --ignore-scripts
npm test
MOBILE_BACKEND_ORIGIN=https://YOUR-MOBILE-BACKEND.vercel.app npm run build
npm run sync
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest :app:lintDebug
./gradlew connectedDebugAndroidTest
```

For CI-only release compilation, `MOBILE_UNSIGNED_VALIDATION=true ./gradlew :app:bundleRelease`. This creates an **unsigned validation bundle**, which must never be presented as a signed Play upload. Inspect the release merged manifest, exported components, SDKs and any native libraries, then verify 16 KB compatibility in Play's bundle explorer. An empty native-library list is evidence only for that binary.

## Separate mobile backend

1. `node mobile/scripts/prepare-backend.mjs` creates ignored `mobile/backend-dist`. Build mobile assets first. This package exposes only `/api/mobile/v1/*`; shared web handlers live under `services`, outside the public API directory. Do not deploy the repository root as a shortcut: its web routes would bypass mobile admission.
2. Use a separate Vercel project with this prepared directory, explicit environment scoping, verified HTTPS URL and no reviewer-blocking sign-in wall. Do not modify the live web project's flags or credentials. No deployment is performed by the preparation script.
3. Apply `mobile/supabase/migrations/20261126223200_mobile_release_controls.sql` to an isolated test database/branch first. Hosted application is still pending; passing PGlite tests is not proof of Supabase API configuration. The existing VoiceTranslator feedback uses company project `tbfvjowsqfvtljfmvzij`; confirm the intended test/production database before applying anything to it. No existing feedback table is altered.
4. Server-only environment: `MOBILE_SUPABASE_URL`, `MOBILE_SUPABASE_SECRET_KEY`, random `MOBILE_LIMIT_KEY` (32+ characters), `MOBILE_API_ENABLED=true`, `VOICE_NOTE_UPLOAD_ENABLED=true`, and working AI Gateway credentials. Optional positive request caps: `MOBILE_REQUESTS_PER_MINUTE` (default 120 per IP/minute), `MOBILE_REQUESTS_PER_DAY` (default 10000 globally/UTC day). These bounds include reports and are not currency budgets. Set provider spend/quota caps independently.
5. Admission trusts Vercel's `x-vercel-forwarded-for`; another ingress needs a reviewed adapter. Missing secrets, missing trusted IP, database errors and quota exhaustion fail closed before provider calls. CORS is client compatibility, not user authentication. Add WAF protections and consider Play Integrity/session quotas before scaling; neither replaces the global daily limit.
6. Enable Supabase Cron using its documented dashboard flow. As an administrator, schedule the uniquely named job below and verify successful job history. It removes only mobile expiry rows. Do not grant public access to Cron or the mobile tables.

```sql
select cron.schedule('vt-mobile-retention', '0 * * * *', 'select public.vt_mobile_purge()');
```

Reports expire after 30 days, with up to one-hour cleanup lag. Minute fingerprints expire after two minutes; daily aggregate buckets expire within 48 hours. Alert on purge failures and remove expired records manually if necessary. Review provider backup retention separately. Restrict report access to authorized reviewers, with a documented rota; in-app reporting is ineffective if nobody reviews it. Use the reference for verified deletion requests. Never put report details in logs or analytics.

7. Verify native origins, preflights, upload/body limits, streaming and report persistence with the installed build. A report is confirmed only after storage returns a reference. Repeat denial tests against the deployed API with anon/publishable keys; those roles must not execute mobile RPCs or read reports. Turn `MOBILE_API_ENABLED=false` to stop mobile processing independently of PWA traffic.

## Signing and publishing

- Company confirms application ID `eu.voicetranslator.app`, developer ownership, organization verification and upload-key custody.
- Set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` in the private build environment. Never commit keys/passwords. No signing identity was generated during this work.
- Set the intended positive `MOBILE_RELEASE_VERSION_CODE` (increment on each upload), and only after the checklist is signed off, `MOBILE_RELEASE_APPROVED=true`.
- Run `./gradlew :app:bundleRelease`; the task rejects missing signing/approval variables unless explicitly doing unsigned CI validation. The environment approval flag is an operator acknowledgement, not proof of Google approval or completion of the checklist.
- Enroll in Play App Signing; validate the signed AAB and its Play-generated split APK installation/update on internal testing. Preserve artifact SHA-256, certificate fingerprint, source commit, backend deployment and evidence together.
- Run manual workflow's emulator instrumentation; it compiles and actually runs tests, unlike merely building the test APK. Physical WhatsApp tests, speech accuracy, accessibility and long sessions remain separate gates.
- Company completes listing, truthful Data safety/ads/audience/rating/AI declarations, privacy review and support ownership. The generated mobile privacy webpage must be publicly deployed before it is entered as a Play privacy URL. `src/privacy.js` is the single text source; confirm legal bases, agreements, actual providers/retention and audience before public release, without adding unsupported compliance claims.
- Obtain explicit authorization before test distribution and again before production submission. Do not claim that a debug APK or unsigned AAB is Play-approved.

## First reviewer walkthrough

No login is implemented. Reviewers need internet and permission to use the microphone.

1. Open Speak, choose source/target languages, tap microphone. Explain the cloud-processing disclosure and microphone permission; allow both, speak and stop. Verify original words and translated text, Listen, Copy and Clear.
2. Open Conversation, choose two languages, Start conversation, finish a turn, hand over, end and inspect any generated summary. Demonstrate cancel/stop behavior and both language directions.
3. Open Voice notes, select an approved short note under 4 MB, choose supported languages, read consent, then Translate. Check translated and original text, Listen, cancel and Clear. Optional actual WhatsApp route uses the Android Share menu, not Forward; saved-file import is available independently of WhatsApp.
4. Open Report a problem. Send a category-only test report; optional details remain disabled until explicitly selected, and no audio/transcript is attached automatically. Record reference, verify restricted storage and delete the test report after validation.
5. Open Privacy; show complete processing/storage/provider information and withdraw the live-processing choice. Next live start must ask again. No account, ads, promotional messaging or native Meta integration is claimed.

## Incident and release control

Monitor only aggregate errors, latency, capacity, crash/ANR and budget metrics. Investigate sanitized references, not user audio. On suspected leak or runaway cost, disable the mobile API, revoke affected secrets, preserve access-controlled minimal evidence, assess provider exposure and company notification obligations, then patch/version without breaking existing installed clients. A release rollback may require a higher-version corrective build; disabling the backend is the immediate containment measure.

The API switch stops new requests. Previously issued direct speech-session tokens may remain usable until provider revocation/expiry; provider-side budget controls and credential/session incident handling are also required.

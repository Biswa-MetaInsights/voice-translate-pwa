# Private visitor analytics for VoiceTranslator

Status: prepared locally; production and Vercel project settings are unchanged.

## Owner page

`/traffic.html` is a dedicated mobile-friendly shortcut to the project's private reports:
https://vercel.com/metainsights/voice-translate-pwa/analytics

The shortcut itself is public and contains no statistics. Vercel login and project membership protect the actual dashboard. It is not a custom in-app statistics dashboard. Reports cover visitors, page views, sources, countries and devices, with date filters according to the available Vercel plan.

## Tracking

A separate asynchronous analytics entry point measures the production translation page using @vercel/analytics 2.0.1. It cannot block the translation application's startup. Recording is limited to the canonical HTTPS production hostnames; localhost and preview hosts do not record. Custom analytics events, unknown paths, and the owner shortcut are excluded. The sanitizer sends only the public page origin/path, dropping query strings, fragments and additional event fields. Do Not Track and Global Privacy Control opt-outs are respected.

There are no custom events containing audio, transcript, translated text or language preferences. This change does not install trackers on the standalone install/privacy pages. Referring websites remain available, but campaign query parameters are deliberately stripped. The privacy notice describes the new analytics processing. This implementation adds no analytics cookies or additional account system.

## Activation and verification

The repository previously had no analytics integration. The connected analytics query returned `404 Web Analytics not found`; this does not establish zero past traffic or prove whether analytics is disabled versus inaccessible to this connection. Old page views cannot be reconstructed by the new client integration.

1. Review and approve the analytics changes and preview deployment.
2. Open this project's Analytics section in Vercel with the authorized owner account and enable Web Analytics if needed. Check any plan/usage charge shown before accepting a paid upgrade. No paid feature was activated during preparation.
3. Approve merging and deploying the production integration.
4. Visit the canonical production application with privacy opt-outs disabled for this explicit test. Verify that the analytics script loads and its page-view request succeeds; confirm the visit appears in the private dashboard after processing.
5. Confirm the traffic shortcut opens the authenticated dashboard and the homepage remains functional if analytics requests are blocked.

Production activation and live recording have not been verified. Privacy tools, blocked requests and daily visitor identification mean visitor counts are estimates, not an exact count of distinct people.

## Validation

Two focused tests cover production/preview/opt-out gating and URL/event data filtering. The complete suite passes 40 tests (38 main-branch tests plus two analytics tests); the Vite production build succeeds. PR #7's separate speech follow-ups are not included or merged by this feature branch. Existing dependency annotation warnings remain non-fatal.

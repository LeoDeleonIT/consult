# Pilot Readiness

## Implemented and locally testable

- Installable responsive PWA for iPhone, iPad, and desktop
- Password authentication with coordinator and manager development roles
- Server-side authorization on protected pages and API routes
- Signed, expiring HTTP-only sessions; SameSite cookies; production Secure cookies
- CSRF and same-origin checks on mutations
- Consent timestamp and disclosure-version capture
- Consent-gated browser recording with pause/resume/stop/discard and preview
- Private audio upload with size, duration, MIME, and file-signature checks
- Server-side fixture and OpenAI provider adapters
- Environment-selected transcription and summary models
- Strict structured-summary schema and malformed-output rejection
- Coordinator editing and approval
- Manager dashboard, detail review, source playback, and minimal audit history
- Manager-only destructive deletion with confirmation
- Unit tests and a synthetic fixture-audio end-to-end workflow
- Live OpenAI transcription and strict structured-summary generation verified locally with synthetic recorded speech on July 29, 2026

## Required before any real patient use

- Trinity legal review and approved patient-consent language
- Employee recording/monitoring policy and training
- Executed BAAs with every service handling PHI, including the selected AI and hosting vendors
- Approved HTTPS deployment and access-control configuration
- Encryption-at-rest and key-management review for database, object storage, and backups
- Documented backup, restore, retention, and deletion behavior
- Vendor data-retention and model-training settings review
- Formal security risk assessment
- Independent application security testing and penetration testing
- Incident-response and breach-notification procedure
- Production identity lifecycle, strong passwords or SSO, account recovery, and offboarding
- Centralized production logs that avoid PHI and have approved retention
- Mobile device management expectations for company iPhones and iPads
- Validation with the exact supported iOS/iPadOS and browser versions
- Clinical and operational review confirming summaries are drafts and never treatment recommendations

## Explicit safety position

This application is an internal technical pilot. It is not represented as HIPAA compliant, production ready, or appropriate for real patient information in its current state. AI output must be reviewed by an authorized human, and the software must not be used to score employee effort, honesty, empathy, or discipline.

## Known technical limitations

- Browser capture is less interruption-tolerant than native AVFoundation recording.
- Audio upload is not resumable and is assembled in browser memory.
- Processing is synchronous rather than a durable background job.
- `delete_after` is recorded, but automatic retention enforcement is not scheduled.
- Local rate limits are intentionally basic and are not a distributed production control.
- Fixture AI proves the pipeline but does not measure transcription quality.
- Continued live-provider operation depends on a funded project key, configured limits, model access, and approved vendor configuration.

## Highest-value next improvements

1. Add a durable processing job table with retries, status polling, and crash recovery.
2. Add resumable multipart audio uploads plus automatic retention deletion.
3. Build the native SwiftUI/AVFoundation capture client described in `docs/NATIVE_IOS_HANDOFF.md`.

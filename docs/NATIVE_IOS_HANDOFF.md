# Native iOS Capture Handoff

The initial web recorder intentionally keeps backend contracts independent of `MediaRecorder`. A future SwiftUI client should reuse the same authentication, storage metadata, processing, analysis, audit, and manager surfaces.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Email/password sign-in; receives an HTTP-only session cookie |
| `GET` | `/api/session` | Current user and CSRF token |
| `POST` | `/api/consultations` | Create consultation and store affirmative consent |
| `GET` | `/api/consultations` | Role-scoped consultation list |
| `GET` | `/api/consultations/{id}` | Authorized detail, transcript, analysis, and audit metadata |
| `POST` | `/api/consultations/{id}/recording/start` | Move `consented` to `recording` and audit start |
| `POST` | `/api/consultations/{id}/recording/stop` | Store stop timestamp and audit stop |
| `POST` | `/api/consultations/{id}/recording/discard` | Return an unuploaded recording to `consented` |
| `POST` | `/api/consultations/{id}/upload` | Multipart audio upload: `audio`, `durationSeconds` |
| `POST` | `/api/consultations/{id}/process` | Idempotently transcribe and create the draft analysis |
| `PATCH` | `/api/consultations/{id}/analysis` | Save coordinator edits after strict validation |
| `POST` | `/api/consultations/{id}/submit` | Approve and submit to manager |
| `GET` | `/api/consultations/{id}/audio` | Authorized private playback |
| `POST` | `/api/consultations/{id}/delete` | Manager-only audited deletion |

## Authentication

The web pilot uses an eight-hour signed HTTP-only cookie and a per-session CSRF token returned by `/api/session`. A native client should use an `URLSession` cookie store and send `X-CSRF-Token` on mutations. Before production use, replace or harden the development password lifecycle and define device/account revocation.

## Upload protocol

The current endpoint accepts one `multipart/form-data` request with:

- `audio`: WAV, WebM, MP3, MP4/M4A with a supported file signature
- `durationSeconds`: positive number within `MAX_RECORDING_MINUTES`

The server enforces `MAX_UPLOAD_MB`, stores the object under a randomized private key, and never exposes a public object URL. A native client should initially export a supported format such as mono AAC/M4A. The immediate backend follow-up should add resumable multipart upload sessions so interrupted iOS uploads can continue.

## State transitions

```text
draft -> consented -> recording -> uploaded -> processing -> review_required -> submitted
                                      |             |
                                      v             v
                                    failed <--------

Any non-deleted state -> deleted (manager only)
```

The server remains authoritative. The client must not infer that a transition succeeded until the endpoint returns success. Processing retries are idempotent and do not create duplicate transcript or analysis rows.

## Required native screens

1. Sign in
2. Consultation list/status
3. Patient and appointment reference
4. Consent disclosure and affirmative confirmation
5. AVFoundation recorder with pause, resume, stop, interruption recovery, and encrypted local staging
6. Upload progress and retry/resume
7. Processing status
8. Coordinator summary review/edit
9. Submission confirmation

The native capture client does not need a separate manager dashboard.

## Web-recorder limitations the native client should solve

- Foreground-only reliability on iOS Safari
- Incoming-call and audio-session interruption recovery
- Encrypted local staging across app restarts
- Background and resumable upload
- Memory pressure from assembling browser chunks
- More precise duration, audio route, and device diagnostics

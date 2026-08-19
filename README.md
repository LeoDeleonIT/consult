# Trinity Dental Consultation Assistant

A working internal-pilot PWA for recording a consented treatment-plan conversation, creating a structured AI draft, coordinating review, and manager oversight. Live use requires an explicitly configured server-side transcription provider; the app will not silently substitute sample content.

This build is not represented as HIPAA compliant or production ready. It defaults to a synthetic-data-only mode that blocks Open Dental and requires `SYN-`, `TEST-`, or `DEMO-` references. Do not use real patient information until the items in [PILOT_READINESS.md](./PILOT_READINESS.md) are completed and the controlled `PHI_PRODUCTION_APPROVED` gate is approved.

## What works

- Password sign-in with coordinator and manager roles
- Server-side route authorization, eight-hour signed sessions, CSRF checks, login rate limiting, and security headers
- Consent capture before recording
- Staff-speaker selection for doctor, treatment coordinator, or dental assistant
- Open Dental Custom Bridge intake with server-side patient lookup
- Mobile browser microphone recording with start, pause, resume, stop, discard, elapsed time, wake lock, preview, and retry-safe upload
- Private local R2-emulated audio storage with randomized object keys
- Fixture and real OpenAI transcription/summary adapters
- Optional durable AWS path: direct private S3 upload, SQS/Step Functions jobs, Amazon Transcribe Standard diarization, Amazon Bedrock structured analysis, polling, and manager deletion
- Human-confirmed staff/patient voice mapping; provider speaker labels are never treated as identities
- Strict structured-summary validation, evidence excerpts, coordinator editing, and approval
- Manager list, filters, detail review, source playback, audit history, and manager-only deletion
- PWA manifest, icons, offline shell, standalone mode, and iPhone/iPad installation instructions
- Automated business-logic tests and a fixture-audio end-to-end smoke test

## Prerequisites

- Node.js 22.13 or newer
- npm 10 or newer
- A current Safari, Chrome, or Edge browser

Docker and a separate database are not required. Local development uses Cloudflare's D1 and R2 emulators inside the monolithic application process. Live processing requires either a server-side OpenAI configuration or the separately deployed AWS pilot stack. Neither provider may be used with real patient information merely because credentials are present.

## Exact local setup

```bash
cp .env.example .env.local
# Keep synthetic-only defaults. Add one approved provider's server-side configuration before recording.
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open the exact local URL printed by the development server, normally [http://localhost:3000](http://localhost:3000).

When `ENABLE_DEVELOPMENT_SEED_USERS=true`, the app also initializes an empty local database and development users on first request. Production configuration rejects this setting.

## Development logins

Both development users use this temporary password:

```text
TrinityPilot!2026
```

| Role | Email |
| --- | --- |
| Coordinator | `coordinator@trinity.local` |
| Manager | `manager@trinity.local` |

These credentials are only for local development. Replace the seed users and password policy before any deployed pilot.

## Run verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The normal E2E command starts an isolated test server in explicit fixture mode:

```bash
npm run test:e2e
```

The E2E test uses `tests/fixtures/synthetic-consultation.wav`, deliberately enables the fixed fixture provider, verifies role boundaries and submission, then confirms manager deletion removes audio and derived data. The UI labels those results as demo content.

## Real OpenAI provider

Live AI is server-only and remains unavailable until a key is configured. Set these values in `.env.local`, restart the server, and run a synthetic test before considering any real-patient workflow:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=your_server_side_project_key
TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize
SUMMARY_MODEL=gpt-5.6-terra
```

No API key is included in client code or browser responses. Audio is read from private storage and posted directly by the server to the [OpenAI file transcription endpoint](https://developers.openai.com/api/docs/guides/speech-to-text). The default transcription model returns timestamped speaker segments; all voices remain unknown until the coordinator explicitly maps staff and patient. Summary extraction uses the Responses API and [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Model identifiers remain environment variables.

Before enabling the real provider for patient information, Trinity must have an approved vendor agreement/BAA and legal, privacy, security, retention, and cloud-configuration approval. Merely setting an API key does not make the pilot compliant.

## Durable AWS synthetic pilot

AWS mode is implemented as new infrastructure under `infra/`; it does not reuse or modify the existing `consult-transcribe` Lambda. The browser requests a five-minute constrained upload from the authenticated app, uploads directly to private KMS-encrypted S3, and the app queues a durable job. Standard Amazon Transcribe produces timestamped raw speaker labels. Amazon Bedrock returns schema-constrained, evidence-backed draft data. A coordinator must map staff and patient labels and approve the draft before submission.

```text
AI_PROVIDER=aws
AUDIO_STORAGE_DRIVER=aws
AWS_REGION=us-east-1
AWS_API_BASE_URL=<deployed API output>
AWS_BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_TRANSCRIBE_MODE=standard
AWS_TRANSCRIBE_LANGUAGE_CODE=en-US
AWS_TRANSCRIBE_MAX_SPEAKERS=2
AWS_ALLOWED_ORIGINS=https://consult.example.internal
AWS_BRIDGE_TOKEN_SECRET=<server-only protected secret>
PHI_PRODUCTION_APPROVED=false
```

No static AWS access key is needed by the browser or application. The server signs short-lived, consultation-scoped bridge tokens using a generated Secrets Manager value. Deployment is deliberately approval-gated. Read the [architecture and cost plan](./docs/AWS_INTEGRATION_PLAN.md), [deployment runbook](./docs/AWS_DEPLOYMENT.md), [security checklist](./docs/AWS_SECURITY_CHECKLIST.md), and [data flow](./docs/AWS_DATA_FLOW.md) before any AWS change.

## Open Dental connection

Open Dental can launch the new-consultation page from a Custom Program Link and pass the selected patient's internal `PatNum`. Trinity Consult then performs a server-side Patients GET request and prefills a minimal patient card; the keys are never exposed to the browser. This route returns `403` while `PHI_PRODUCTION_APPROVED=false`.

The official API requires both a Developer API Key and an office-specific Customer API Key. The office must also enable the API key and keep eConnector running. Add the following server-only values:

```text
OPEN_DENTAL_DEVELOPER_KEY=your_developer_key
OPEN_DENTAL_CUSTOMER_KEY=your_office_customer_key
OPEN_DENTAL_API_BASE_URL=https://api.opendental.com/api/v1
```

See [Open Dental bridge setup](./docs/OPEN_DENTAL_BRIDGE_SETUP.md) for the exact Program Link button configuration.

### Live-provider verification

On July 29, 2026, the complete live path was tested locally with a synthetic recording and fake patient reference: private audio retrieval, `gpt-4o-transcribe-diarize` transcription, strict `gpt-5.6-terra` structured summary generation, coordinator review and submission, and manager review all succeeded. The automated fixture workflow separately verifies manager-only deletion. This technical test does not authorize real patient use.

## iPhone and iPad installation

1. Deploy the app behind trusted HTTPS.
2. Open the HTTPS address in Safari.
3. Tap **Share**.
4. Choose **Add to Home Screen**.
5. Launch **Trinity Consult** from the Home Screen icon.

For the web pilot, Safari must stay open and active during recording. Avoid calls and device interruptions. Microphone testing from another physical device requires trusted HTTPS; do not weaken browser security to bypass that requirement.

## Data storage and deletion

- Structured records use D1 (SQLite locally).
- Audio uses a private R2 binding (local emulator in development).
- AWS mode uses private customer-KMS-encrypted S3 for audio/artifacts and customer-KMS-encrypted DynamoDB for durable job state.
- Audio endpoints require an authenticated, authorized session and are sent with `Cache-Control: private, no-store`.
- Manager deletion removes the R2 object, transcript row, analysis row, and patient/appointment references; it retains only a minimal tombstone and audit event.
- `AUDIO_RETENTION_DAYS` is stored as `delete_after`, but automatic deletion scheduling is a known follow-up item.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local application |
| `npm run db:migrate` | Apply the local D1 schema |
| `npm run db:seed` | Add the two development users |
| `npm test` | Run unit/business-logic tests |
| `npm run test:e2e` | Run the P0 fixture-audio browser smoke test |
| `npm run typecheck` | Check strict TypeScript |
| `npm run lint` | Run ESLint |
| `npm run build` | Produce the deployment build |
| `npm --prefix infra test` | Run AWS authorization, transcript, analysis, and CDK template tests |
| `npm --prefix infra run build` | Type-check the AWS CDK and Lambda code |
| `npm run test:aws-integration` | Run the gated deployed-AWS synthetic smoke test (skipped unless explicitly enabled) |

## Known limitations

- The browser assembles recording chunks into one Blob before upload; maximum duration and upload size are enforced.
- iOS Safari must remain foregrounded. Incoming calls and OS interruptions can disrupt capture.
- Upload retries retain the stopped Blob only while the page remains open.
- OpenAI/fixture processing still uses the application request execution context. AWS mode uses SQS, Standard Step Functions, Lambda, durable DynamoDB status, and authenticated polling.
- Fixture processing is disabled by default. Tests opt in with `AI_PROVIDER=fixture` and `ALLOW_FIXTURE_PROCESSING=true`; the UI marks the output as fixed sample data.
- The live provider requires a funded OpenAI project key with access to both configured models; billing, project limits, or revoked permissions can stop processing.
- AWS lifecycle/TTL retention is implemented; local R2 automatic retention scheduling, distributed app rate limiting, resumable multipart uploads, and native iOS interruption recovery remain follow-up work.

See [docs/NATIVE_IOS_HANDOFF.md](./docs/NATIVE_IOS_HANDOFF.md) for the clean backend contract intended for a later native capture client.

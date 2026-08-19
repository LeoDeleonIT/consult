# AWS Transcribe and Bedrock synthetic pilot plan

Status: design approved for local implementation only. No AWS resources have been created or changed by this branch. This plan is limited to synthetic data and does not authorize real patient information.

## Safety position

The AWS account identity was verified as account `641949334187` in `us-east-1`. The current AWS user can list Bedrock foundation models but cannot inspect the existing `consult-transcribe` Lambda or its IAM role. The existing Lambda will therefore remain untouched and will not be reused unless an authorized reviewer first grants read access and its runtime, handler, code, environment-variable names, timeout, memory, execution role, and policies are inspected.

No AWS access key or secret key is used by the application. Local tooling uses the AWS SDK default credential chain. Deployed functions use IAM execution roles. Browser code receives only a short-lived, single-object S3 upload form and never receives AWS credentials or the server-to-server bridge token.

## Current architecture

The current Vinext application runs as one Cloudflare Worker-compatible service:

- app-owned password sessions, CSRF protection, server-side role checks, consent capture, and audit events;
- D1 for users, consultations, recording metadata, transcripts, analyses, approvals, and audit events;
- R2 for private audio;
- one multipart upload route that buffers the complete audio file;
- fixture or OpenAI provider adapters; and
- background work attached to the Cloudflare request execution context with `waitUntil()`.

That implementation is suitable for deterministic local fixture tests but is not a durable AWS job system. A Worker restart or exhausted execution window can abandon processing.

## Proposed architecture

```text
Authenticated Consult browser
  -> Consult server (existing session, role, CSRF, ownership checks)
  -> short-lived HMAC bridge token (server only)
  -> API Gateway HTTP API + Lambda request authorizer
  -> API Lambda
       -> private KMS-encrypted S3 upload form
       -> DynamoDB job state
       -> encrypted SQS intake queue + DLQ
  -> dispatcher Lambda
  -> Step Functions Standard workflow
       -> worker Lambda starts Amazon Transcribe batch job
       -> durable wait/check loop
       -> worker Lambda normalizes timestamped speaker labels
       -> Amazon Bedrock structured analysis
       -> private encrypted S3 artifacts + DynamoDB terminal state
  -> Consult server polls authorized job status
  -> existing review UI requires human speaker mapping and draft approval
```

The CDK stack is `ConsultAwsPilotStack` under `infra/`. It creates new pilot resources with generated names. It does not hard-code the AWS account ID and does not modify the existing `consult-transcribe` Lambda.

## Data inventory and boundaries

| Data | Browser | Consult server / D1 | API Gateway | S3 | DynamoDB | Transcribe | Bedrock | CloudWatch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Audio bytes | Captured and uploaded with a short-lived form | Fixture/OpenAI modes only; AWS mode does not buffer the upload | Not carried in API requests | Private encrypted source object | Never | Reads encrypted source | Never | Never |
| Raw speaker transcript | Review display | Synthetic-only copy for the existing UI | Authorized status response only | Private encrypted artifact | Never | Produces it | Structured prompt input | Never |
| Structured analysis | Review/edit display | Synthetic-only copy for existing review and approval | Authorized status response only | Private encrypted artifact | Provider/model and status only | Never | Produces it | Never |
| Identifiers | Opaque consultation/job IDs | Existing patient reference remains in D1 | Opaque IDs only | Random opaque keys | Opaque IDs and object keys | Opaque job name | No patient identity | Opaque job ID only when needed |
| Audit data | None | Minimal approved events | Access logs exclude bodies and authorization headers | None | Safe status/failure codes | None | None | Operational status only |

Patient names, phone numbers, Open Dental `PatNum` values, treatment details, transcript text, and audio must not appear in object keys, job names, log messages, metric dimensions, KMS encryption context, API access logs, or DynamoDB job items.

Because the current app continues to store a review copy of synthetic transcript and analysis in Cloudflare D1, this branch remains synthetic-only. Real-patient use would require a separately approved Cloudflare BAA/configuration or a redesign that keeps those records entirely inside the approved AWS boundary.

## Authentication and authorization

The existing Consult server remains the source of user authentication, roles, ownership, consent, CSRF, approval, and manager-only deletion decisions.

For each server-to-server AWS call, Consult creates a token valid for at most two minutes. It contains only issuer, audience, opaque user ID, role, opaque consultation ID, unique token ID, issued-at time, and expiration. The signing value is stored only in the Consult server secret environment and AWS Secrets Manager.

API Gateway uses a Lambda request authorizer on every `/v1/*` route. No production route uses `AuthorizationType: NONE`. The authorizer checks the signature, issuer, audience, time window, role, and consultation scope. The API Lambda checks those claims again for job ownership and requires the manager role for deletion.

API and bucket CORS are explicit HTTPS origins supplied during deployment. Wildcards are rejected. Presigned S3 forms expire after five minutes, enforce one randomized key, exact MIME type, a configured maximum size, and KMS encryption fields.

## Encryption

- One customer-managed symmetric KMS key with annual automatic rotation.
- S3 blocks public access, uses bucket-owner-enforced ownership, denies non-TLS traffic, and denies unencrypted or incorrectly encrypted writes.
- S3 source audio and transcript/analysis artifacts use the customer-managed key.
- DynamoDB uses the same customer-managed key and point-in-time recovery.
- SQS and its DLQ use the customer-managed key.
- CloudWatch log groups use short retention and contain no request bodies or conversation content.
- No sensitive KMS encryption context is used.
- Traffic uses HTTPS/TLS.

## Durable processing and idempotency

1. `POST /v1/uploads` creates an `awaiting_upload` item only if the opaque job ID does not already exist and returns the constrained S3 form.
2. `POST /v1/jobs` verifies the object by `HeadObject`, including size, MIME type, and KMS encryption; atomically moves the job to `queued`; and sends one SQS message. Manual retries are bounded at five attempts.
3. The SQS dispatcher starts a Standard Step Functions execution named with the opaque job ID. Duplicate messages resolve to the same execution and do not create duplicate analysis.
4. The workflow starts or reuses one deterministic opaque Transcribe job per attempt, waits outside Lambda, and checks boundedly until `COMPLETED` or `FAILED`.
5. The worker normalizes punctuation, timestamps, and raw speaker labels without assigning a person to `spk_0` or `spk_1`.
6. Bedrock returns tool-schema JSON. The worker validates it again with the existing Zod schema before saving.
7. Each state change uses a conditional DynamoDB update. Retries are bounded with exponential backoff. Permanent failures record only a safe failure code.
8. SQS redrives dispatcher failures to a DLQ. CloudWatch alarms cover DLQ depth, Lambda errors, and failed Step Functions executions.

Step Functions Standard is durable independently of the HTTP request and Cloudflare `waitUntil()`. Wait states do not hold a Lambda invocation open.

## Speaker confirmation

Transcribe diarization separates voices; it does not identify people. AWS-normalized segments keep `speaker: "unknown"`, preserve `speakerLabel` such as `spk_0`, and set `speakerMapping: "unconfirmed"`.

The existing review UI will require an authorized coordinator to map the two raw labels to staff and patient after listening to the source audio. Submission is rejected server-side until the mapping is confirmed. Unexpected or missing labels remain unknown and require review.

## Structured analysis limits

The model ID is deployment configuration (`AWS_BEDROCK_MODEL_ID`) and is never assumed from account availability. Fable and Mythos identifiers are rejected. The planned synthetic evaluation default is `amazon.nova-lite-v1:0`, which AWS currently lists for on-demand use in `us-east-1`; deployment still requires an authorized invocation check.

The schema allows only treatment discussed, price/financing discussed, questions or concerns, patient decision, next steps, checklist topic detection, a short draft summary, warnings, and timestamped evidence. The prompt forbids clinical recommendations, unsupported facts, employee scores, and disciplinary conclusions. Malformed, incomplete, or unsupported output fails closed. AWS mode never calls OpenAI.

## Retention and deletion

`AUDIO_RETENTION_DAYS` defaults to 30. S3 lifecycle rules expire uploads, transcription output, analysis output, and temporary artifacts. DynamoDB TTL schedules job-state removal after the approved retention window. S3 versioning is disabled so expired current objects do not leave noncurrent copies.

Manager deletion remains the only user-facing destructive action. It first calls the authenticated AWS delete route, which removes source audio and all generated prefixes, requests deletion of the opaque Transcribe job when permitted, and moves the job through `deleting` to `deleted`. Only after AWS confirms deletion does the existing application remove transcript/analysis copies and patient/appointment references. A minimal tombstone and non-sensitive audit event remain.

CDK resources use retention-safe removal policies by default. Stack removal requires a deliberate operator procedure; the KMS key has a waiting period and is never force-deleted by the application.

## Failure handling

- Upload intents expire and can be safely recreated.
- Job creation is conditional and idempotent.
- SQS retries dispatcher failures and uses a DLQ.
- Step Functions retries transient Lambda and AWS service failures with exponential backoff.
- Transcribe terminal failure becomes a safe code such as `transcription_failed`; provider messages and transcript content are not stored in logs or exposed to users.
- Bedrock access, throttling, malformed schema, and unavailable-model failures remain distinct safe codes.
- The existing UI shows that audio is saved and permits a later retry without another recording.
- No AWS failure triggers an OpenAI fallback.

## Pilot cost estimate

Example planning volume: 200 synthetic consultations per month, averaging 10 minutes each (2,000 audio minutes), with about 6,000 Bedrock input tokens and 1,000 output tokens per consultation.

| Service | Approximate monthly pilot cost | Main driver |
| --- | ---: | --- |
| Amazon Transcribe batch | `$12.00` | 2,000 minutes at the published `us-east-1` example rate of `$0.006/minute` |
| Amazon Bedrock Nova Lite | about `$0.12` | 1.2M input and 0.2M output tokens at published Nova Lite rates |
| AWS KMS | at least `$1.00` | one customer-managed key, plus request charges and future rotated-key material |
| S3, DynamoDB, SQS, Lambda, API Gateway, Step Functions, CloudWatch | usually low single-digit dollars at this volume | requests, storage, logs, state transitions, and data transfer |
| Expected total | roughly `$14–$20/month` | excludes unusual retries, large recordings, data transfer, alarms, taxes, and future price changes |

Pricing references, checked 2026-08-18:

- <https://aws.amazon.com/transcribe/pricing/>
- <https://aws.amazon.com/bedrock/pricing/>
- <https://aws.amazon.com/kms/pricing/>
- <https://aws.amazon.com/s3/pricing/>
- <https://aws.amazon.com/api-gateway/pricing/>
- <https://aws.amazon.com/step-functions/pricing/>
- <https://aws.amazon.com/lambda/pricing/>
- <https://aws.amazon.com/dynamodb/pricing/>

This is a planning estimate, not a quote. An AWS Budget and billing alarm should be configured before the pilot.

## BAA and approval boundary

The user reports that the AWS account's standard BAA is active. This plan does not independently verify that agreement, that every selected service/configuration is in scope, or that the application meets HIPAA requirements. Cloudflare D1/R2, user devices, Open Dental, networking, identity, support access, backups, logging, and operational processes remain separate review boundaries.

The system remains synthetic-only until legal/privacy approval, vendor and service eligibility review, security risk analysis, penetration testing, production identity lifecycle, device management, incident response, retention approval, backup/restore testing, and operational monitoring are complete.

## Implementation and deployment gates

Local implementation may proceed on `codex/aws-transcribe-bedrock-pilot`. Before deployment, the following must be shown and approved:

1. `cdk synth` output and `cdk diff`;
2. all IAM grants, including every unavoidable wildcard;
3. exact origins, model ID, retention period, upload limits, and log retention;
4. confirmation that the existing Lambda remains unchanged or a separately approved reuse diff;
5. a successful model invocation permission check;
6. permission for the operator to inspect Lambda and IAM configuration;
7. expected monthly budget and alarms; and
8. rollback/removal steps.

No `cdk deploy` or destructive AWS command may run before that approval.

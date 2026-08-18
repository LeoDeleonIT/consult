# AWS synthetic-pilot security checklist

## Required before deployment

- [ ] Account and `us-east-1` target independently confirmed.
- [ ] Exact `cdk diff` reviewed; existing `consult-transcribe` Lambda absent from the template.
- [ ] CDK Nag report has zero unsuppressed errors.
- [ ] Explicit HTTPS CORS origin configured; no wildcard.
- [ ] `AUTH_SECRET` is unique, protected, and at least 32 characters.
- [ ] `ENABLE_DEVELOPMENT_SEED_USERS=false` in production.
- [ ] `ALLOW_FIXTURE_PROCESSING=false` in production.
- [ ] `APP_URL` uses trusted HTTPS.
- [ ] `PHI_PRODUCTION_APPROVED=false` for this synthetic pilot.
- [ ] AWS bridge HMAC secret is stored server-side only and is absent from Git/browser bundles.
- [ ] CloudWatch alerts have an owned response channel and escalation contact.
- [ ] Cost owner accepts the estimate and configures account-level budget alerts.

## Implemented technical controls

- Private S3 with Block Public Access, Bucket Owner Enforced ownership, TLS-only policy, KMS encryption, exact CORS, server access logs, opaque random keys, and lifecycle expiration.
- Presigned POST expires after five minutes and constrains object key, MIME type, byte length, KMS encryption, and KMS key.
- API Gateway routes require a short-lived HS256 server bridge token scoped to actor, role, and consultation. The browser never receives the token.
- DynamoDB uses customer-managed KMS encryption, on-demand capacity, point-in-time recovery, TTL, and retained deletion policy.
- KMS-encrypted SQS queue, dead-letter queue, retry limit, Standard Step Functions workflow, safe terminal failure codes, and alarms.
- Standard Amazon Transcribe batch mode with speaker labels and exactly two configured speaker labels. Raw labels are not identities.
- Coordinator must explicitly map staff and patient voices before submission; additional/unexpected voices remain `unknown`.
- Bedrock output is Zod validated and requires timestamped evidence for extracted treatments, prices, financing, concerns, objections, decisions, next steps, and detected checklist topics.
- No employee score, clinical recommendation, or unsupported fact is requested or accepted.
- Lambda and Step Functions execution-data logging avoid audio, transcript, analysis, authorization tokens, and presigned URLs.
- Manager-only deletion removes audio and derived AWS artifacts, then minimizes the application record. Lifecycle/TTL provide a secondary retention bound.

## Required before any real patient information

- [ ] Trinity legal and privacy approval.
- [ ] Approved recording disclosure and affirmative-consent workflow.
- [ ] Executed AWS BAA and confirmation that every selected service/configuration is eligible for the intended workload.
- [ ] Hosting, database, backup, monitoring, and any non-AWS vendor BAAs/agreements approved.
- [ ] Formal security risk assessment and independent application penetration test complete.
- [ ] Production identity lifecycle, MFA/SSO decision, account recovery, and offboarding complete.
- [ ] Retention/deletion schedule, backup restore, incident response, and breach-notification procedures approved and tested.
- [ ] Open Dental integration authorized and scoped; patient fields minimized.
- [ ] Supported device/browser testing and staff training complete.
- [ ] `PHI_PRODUCTION_APPROVED=true` changed only through controlled deployment review.

This checklist does not certify HIPAA compliance. Compliance depends on contracts, policies, operations, configuration, and continuing risk management in addition to code.

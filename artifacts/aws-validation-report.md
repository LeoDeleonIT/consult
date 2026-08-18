# AWS integration local validation

Recorded 2026-08-18 on branch `codex/aws-transcribe-bedrock-pilot`. All tests used synthetic data. No AWS resource was created, updated, invoked for processing, or deleted.

## Passed checks

| Check | Result |
| --- | --- |
| Root `npm run typecheck` | Passed |
| Root `npm run lint` | Passed, zero warnings |
| Root `npm test` | Passed: 5 files, 31 tests |
| Root `npm run build` | Passed with Vinext 1.0.0-beta.6 / Vite 8.2.1 |
| Root `npm run test:e2e` | Passed: 3 browser workflows |
| Infrastructure `npm run build` | Passed |
| Infrastructure `npm test` | Passed: 5 files/11 tests; deployed-AWS test intentionally skipped |
| `npx cdk synth --quiet` | Passed |
| CDK Nag | Zero unsuppressed findings |
| Root `npm audit` | Zero vulnerabilities |
| Infrastructure `npm audit` | Zero vulnerabilities |
| Diff whitespace check | Passed |
| Secret-pattern scan | No AWS access key, private key, OpenAI key, GitHub token, or Slack token pattern found outside ignored dependencies/build/test output |

The browser workflow verifies coordinator authentication and role boundaries, synthetic consent and reference enforcement, microphone recording states, upload, fixture processing, review, submission, manager keyword/tag filtering, office access, manager-only deletion, post-deletion audio denial, and mobile microphone-permission guidance.

The AWS tests verify short-lived consultation-scoped token expiry/tampering/audience checks; raw speaker labels and timestamps; punctuation normalization; malformed Transcribe rejection; required evidence; evidence quote/timestamp/source matching; rejection of guessed speaker identity; KMS/private storage, CORS, lifecycle, PITR/TTL, DLQ, protected routes, Standard workflow logging/tracing, alarms, current Lambda runtime, and absence of AWS-managed execution policies or mutation of `consult-transcribe`.

## Synthesized new resources

- 1 customer-managed KMS key and alias
- 2 S3 buckets and policies (private data + access-log archive)
- 1 DynamoDB table
- 1 SQS queue and 1 dead-letter queue, each with TLS-only policy
- 1 Secrets Manager secret
- 6 IAM roles and 6 inline policies
- 4 Lambda functions
- 1 Standard Step Functions state machine
- 1 API Gateway HTTP API, authorizer, integration, stage, and 5 protected routes
- 6 CloudWatch alarms and 6 log groups

## Approval-blocked checks

`cdk diff --no-change-set` was attempted against account `641949334187` in `us-east-1`. It did not create a change set, but the AWS user `TrinityBraindemo` lacks `cloudformation:DescribeStacks`, so an account comparison could not be produced. Earlier inspection also established that the user lacks `lambda:GetFunction` and IAM role-policy listing permissions for the existing Lambda.

The deployed synthetic smoke test remains not run because no stack exists from this branch and deployment requires explicit approval of the plan, exact origin, IAM grants, cost, and final diff. See `artifacts/aws-smoke-test-report.md`.

# AWS synthetic-pilot deployment runbook

This runbook creates new pilot resources in `us-east-1`. It does not import, update, invoke, or delete the existing `consult-transcribe` Lambda. No deployment is authorized merely because this document exists: review `docs/AWS_INTEGRATION_PLAN.md`, the synthesized template, `cdk diff`, cost expectations, and the exact target account before approving `cdk deploy`.

## Prerequisites

- Target account and region confirmed (`641949334187`, `us-east-1` for the inspected environment).
- An AWS principal allowed to create the KMS, S3, DynamoDB, SQS, Secrets Manager, IAM, Lambda, Step Functions, API Gateway, CloudWatch, and log resources in the CDK template.
- CDK bootstrap completed for the account/region by an authorized AWS administrator.
- Exact HTTPS application origin selected; no wildcard CORS origin.
- Synthetic audio only. Keep `PHI_PRODUCTION_APPROVED=false`.
- Bedrock model selected and approved. The default is `amazon.nova-lite-v1:0`; Fable and Mythos identifiers are rejected in code and infrastructure.

The currently inspected `TrinityBraindemo` user could identify the AWS account and list Bedrock models, but could not inspect the existing Lambda or enumerate its IAM role policies. Do not treat that user as deployment-ready until an administrator reviews its permissions.

## Local verification before approval

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build

cd infra
npm ci
npm run build
npm test
npx cdk synth
npx cdk diff
```

`cdk synth` is local template generation. `cdk diff` is read-only but requires AWS describe/list permissions. Neither command deploys resources. Review the CDK Nag report in `infra/cdk.out/AwsSolutions--ConsultAwsPilotStack-NagReport.csv` and require zero unsuppressed errors.

Override the placeholder origin during synthesis and deployment:

```bash
npx cdk synth -c allowedOrigins='["https://consult.example.internal"]'
npx cdk diff -c allowedOrigins='["https://consult.example.internal"]'
```

## Exact deployment action after written approval

Only after the user approves the plan and exact diff:

```bash
npx cdk deploy ConsultAwsPilotStack \
  -c allowedOrigins='["https://consult.example.internal"]' \
  --require-approval never
```

The `--require-approval never` flag is acceptable only because approval must already have occurred outside the command after reviewing the exact diff. It must not be used to bypass that review.

Record these stack outputs without posting them to chat or tickets containing patient information:

- `ApiBaseUrl`
- `BridgeSecretArn`
- `AudioBucketName`
- `JobsTableName`
- `KmsKeyArn`
- `BedrockModelId`

Retrieve the generated `tokenSecret` from the one bridge secret through an approved administrator workflow. Store it only in the application server's protected secret/environment configuration as `AWS_BRIDGE_TOKEN_SECRET`. Never put it in browser code, Git, a screenshot, shell history, or a public build log.

Configure the app server:

```text
AI_PROVIDER=aws
AUDIO_STORAGE_DRIVER=aws
AWS_REGION=us-east-1
AWS_API_BASE_URL=<ApiBaseUrl output>
AWS_BEDROCK_MODEL_ID=amazon.nova-lite-v1:0
AWS_TRANSCRIBE_MODE=standard
AWS_TRANSCRIBE_LANGUAGE_CODE=en-US
AWS_TRANSCRIBE_MAX_SPEAKERS=2
AWS_ALLOWED_ORIGINS=https://consult.example.internal
AWS_BRIDGE_TOKEN_SECRET=<protected server secret>
PHI_PRODUCTION_APPROVED=false
```

Restart the app and verify the synthetic-only banner. In an approved test runner, inject these variables through its protected secret/environment mechanism (do not paste the bridge secret into shell history):

```text
RUN_AWS_INTEGRATION_TESTS=true
AWS_REGION=us-east-1
AWS_INTEGRATION_EXPECTED_ACCOUNT=<approved account ID>
AWS_INTEGRATION_API_BASE_URL=<ApiBaseUrl output>
AWS_INTEGRATION_BRIDGE_SECRET=<protected secret injection>
AWS_INTEGRATION_BUCKET_NAME=<AudioBucketName output>
AWS_INTEGRATION_KMS_KEY_ARN=<KmsKeyArn output>
```

Then run:

```bash
npm run test:aws-integration
```

The smoke test performs upload, durable queueing, Transcribe, Bedrock analysis, polling, and manager deletion. It intentionally does not print the token, presigned URL, transcript, or analysis.

## Rollback and incident controls

- To stop new AWS work without deleting data, disable access to the app or restore `AI_PROVIDER=openai` and `AUDIO_STORAGE_DRIVER=r2` only if that provider path is separately approved and configured.
- To preserve uploaded evidence during investigation, leave the retained stack resources intact and revoke application access.
- Rotate the bridge secret through a coordinated maintenance window; deploy the new app-side value and restart all instances so the authorizer cache is cleared.
- KMS key, S3 buckets, DynamoDB table, queues, and bridge secret use retain policies. Stack deletion does not guarantee data deletion.
- Any destructive cleanup requires a separate, resource-by-resource plan and explicit approval.

## Removing the synthetic pilot

Removal is destructive and needs a second explicit approval. Do not start with `cdk destroy`, because the data-bearing resources intentionally use `Retain` and would remain while the API is removed.

1. Disable new AWS-mode consultations and revoke user access to the pilot.
2. Record the stack outputs and verify the target account/region again.
3. Use manager deletion for every synthetic consultation; confirm each AWS job reports `deleted`.
4. Verify `uploads/`, `transcripts/`, `analysis/`, and `temporary/` contain no required objects. Do not use an unreviewed recursive delete command.
5. Decide whether the DynamoDB deletion-state tombstones and access logs must finish their approved retention periods or may be removed early.
6. After an exact `cdk diff` and approval, run `npx cdk destroy ConsultAwsPilotStack` to remove non-retained compute/API resources.
7. Separately remove retained resources through an approved AWS administrator workflow: the two S3 buckets (only after reviewed emptying), DynamoDB table, SQS queues, bridge secret with an appropriate recovery window, and KMS key with its 30-day pending-deletion window.
8. Verify CloudFormation, API Gateway, Lambda, Step Functions, queues, table, buckets, secret, alarms, logs, and KMS alias/key state. Preserve the sanitized removal record.

The existing `consult-transcribe` Lambda and `consult-transcribe-role-mp9h2ccs` are outside this stack and must not be changed during pilot removal.

## IAM changes in the proposed stack

| Principal | Allowed scope |
| --- | --- |
| API Lambda | Exact job table Get/Put/Update; queue SendMessage; S3 upload Put plus Get/Delete on upload/transcript/analysis prefixes; exact KMS key use; Transcribe DeleteJob only (AWS requires `Resource: *`) |
| Worker Lambda | Exact job table Get/Update; S3 Get on upload/transcript prefixes and Put on transcript/analysis prefixes; exact KMS key; Transcribe Start/Get only (AWS requires `Resource: *`); pass only the Transcribe data role; invoke only the configured Bedrock model/inference profile |
| Dispatcher Lambda | Exact job table Get; consume only the jobs queue; start only the pilot state machine; exact KMS key where required by the encrypted queue |
| Authorizer Lambda | Read only the one bridge secret and its KMS key |
| Transcribe data role | Get only `uploads/*`, Put only `transcripts/*`, prefix-constrained bucket listing, and exact KMS key use |
| Step Functions role | Invoke only the worker and generated versions; CloudWatch Logs delivery/X-Ray actions that do not support resource scoping are documented CDK Nag exceptions |

No AWS-managed `AmazonTranscribeFullAccess` policy is attached to any new role. The pre-existing role and its temporary policy are not reused or modified.

# AWS synthetic smoke-test report

Status: **not run against deployed resources**

The local application, infrastructure unit tests, CDK synthesis, and security checks can be completed without deploying. The real upload → Transcribe → Bedrock → review path cannot be truthfully marked passed until the user approves the exact AWS diff and an authorized principal deploys the new pilot stack.

Planned gated command: `npm run test:aws-integration` with `RUN_AWS_INTEGRATION_TESTS=true` and protected server-side test variables.

The live test uses only `tests/fixtures/synthetic-consultation.wav` and is designed not to print tokens, presigned URLs, transcript text, or analysis content. It verifies the caller account/region, private-access block, source-object KMS encryption, timestamped raw speaker labels, schema-valid analysis and provider/model metadata, then deletes the job and verifies the source and generated prefixes are empty. On success, update this report with the UTC date, sanitized stack identifier, model ID, final status, deletion result, and test command exit status—never the transcript, recording, patient information, or secret values.

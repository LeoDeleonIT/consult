# AWS synthetic smoke-test report

Status: **passed against deployed AWS resources**

- Date: 2026-08-18 (UTC)
- Region: `us-east-1`
- Stack: `ConsultAwsPilotStack`
- Transcription model: `amazon-transcribe-standard`
- Analysis model: `amazon.nova-lite-v1:0`
- Fixture: `tests/fixtures/synthetic-consultation.wav` (two synthetic voices; no patient data)
- Final test result: `SYNTHETIC_SMOKE_PASS`

Verified end to end:

1. A short-lived, consultation-scoped manager token created an upload job.
2. The synthetic WAV uploaded through a presigned form.
3. The source object used the stack KMS key and the bucket's public-access block remained enabled.
4. AWS Transcribe returned timestamped raw speaker labels without assigning patient or staff identities.
5. Amazon Bedrock returned schema-valid, evidence-checked structured analysis.
6. The manager delete route removed the source audio, normalized/raw transcript artifacts, analysis artifact, and Transcribe write-access marker.
7. The DynamoDB row remained only as a `deleted` tombstone.

Post-test cleanup verification:

- Audio bucket object listing: empty.
- DynamoDB jobs whose status was not `deleted`: `0`.
- No token, presigned URL, secret value, transcript text, analysis content, or patient information was printed or stored in this report.

Notes:

- Earlier synthetic runs exposed two issues before the final pass: Nova omitted an empty `objections` collection, and Transcribe left a `.write_access_check_file.temp` marker. Both cases now have narrow regression fixes.
- This proves the synthetic AWS pilot workflow. It does not authorize real-patient data or establish production PHI compliance.

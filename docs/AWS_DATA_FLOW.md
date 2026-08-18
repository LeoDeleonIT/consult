# AWS data flow and trust boundaries

```text
Coordinator browser
  | authenticated app session + CSRF
  | upload intent (MIME, bytes, duration only)
  v
Trinity Consult server (D1 application record)
  | short-lived server-only, consultation-scoped HMAC token
  v
API Gateway + Lambda authorizer
  | creates opaque job + five-minute constrained POST
  v
Private KMS-encrypted S3 <--- direct audio POST --- Coordinator browser
  |
  | authenticated queue request after S3 HEAD validation
  v
KMS-encrypted SQS -> dispatcher Lambda -> Standard Step Functions
  |
  +-> worker Lambda -> Amazon Transcribe Standard
  |                    | raw timestamped speaker labels
  |                    v
  |                  private KMS-encrypted S3
  |
  +-> worker Lambda -> Amazon Bedrock structured tool output
                       | Zod schema + evidence validation
                       v
                     private KMS-encrypted S3
  |
  v
DynamoDB durable status -> authenticated app-server polling
  | validated transcript + analysis copied to app database
  v
Coordinator human review and explicit voice mapping
  |
  v
Manager review / manager-only deletion
```

## Data inventory

| Data | Location | Protection | Default retention |
| --- | --- | --- | --- |
| Synthetic audio | S3 `uploads/` opaque keys | Private, TLS, customer KMS | 30 days |
| Raw/normalized transcript | S3 `transcripts/` and application D1 | Private, KMS in AWS; app access controls | 30 days in AWS; manager deletion in app |
| Structured draft | S3 `analysis/` and application D1 | Private, KMS in AWS; schema/evidence validation | 30 days in AWS; manager deletion in app |
| Job state | DynamoDB | Customer KMS, PITR, TTL | 30-day TTL target |
| Bridge secret | Secrets Manager and protected app environment | Customer KMS; server-only | Until coordinated rotation |
| Operational logs | CloudWatch and access-log S3 bucket | No request body, transcript, analysis, token, or URL | 7 days CloudWatch; 90 days S3 access logs |

## Important boundaries

- The browser receives only a constrained presigned POST, never AWS credentials or the bridge token.
- The application server authenticates the user and scopes each AWS token to one consultation.
- Transcribe speaker labels (`spk_0`, `spk_1`, and any unexpected label) are voice clusters, not identities.
- Bedrock output is always an unapproved draft. The coordinator must confirm voice identity and review content before manager submission.
- `PHI_PRODUCTION_APPROVED=false` blocks Open Dental and requires explicitly synthetic references. It does not replace staff training or policy enforcement.

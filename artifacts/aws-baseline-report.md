# AWS integration baseline

Recorded 2026-08-18 before application or infrastructure changes on branch `codex/aws-transcribe-bedrock-pilot` at upstream commit `f3a152d`.

| Check | Result |
| --- | --- |
| Node | `v25.8.2` (meets the repository's `>=22.13.0` requirement) |
| npm | `11.11.1` |
| `npm ci` | Passed; 541 packages installed from the lockfile |
| `npm run lint` | Passed with one pre-existing unused-import warning in the recording-start route |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 3 files, 21 tests |
| `npm run build` | Passed |
| `npm run test:e2e` | Failed: 2 passed, 1 stale assertion expected 17 offices while the application intentionally returns 18 pilot offices including Pearl Dentistry |
| AWS identity | Correct account `641949334187`, region `us-east-1` |
| Bedrock discovery | Read access succeeded; eligible non-Fable/non-Mythos text models are listed in the account catalog |
| Existing Lambda inspection | Blocked: current IAM user lacks `lambda:GetFunction` |
| Existing role inspection | Blocked: current IAM user lacks IAM role/policy read permissions |
| Secret scan | No access-key, private-key, GitHub-token, OpenAI-key, or Slack-token pattern found in the working tree or the single-commit Git history; `.env.example` is the only committed `.env*` file |

No AWS resource was created, modified, or deleted during baseline verification.

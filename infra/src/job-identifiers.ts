export const MAX_JOB_ATTEMPTS = 5;

export function transcribeJobNameFor(jobId: string, attempt: number): string {
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !Number.isInteger(attempt) || attempt < 1 || attempt > MAX_JOB_ATTEMPTS) {
    throw new Error("job_identifier_invalid");
  }
  return `consult-${jobId.replaceAll("-", "")}-${attempt}`;
}

const forbiddenKeys = new Set([
  "patientReference",
  "appointmentReference",
  "transcript",
  "audio",
  "recording",
  "patientName",
]);

export function sanitizeAuditMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !forbiddenKeys.has(key)),
  );
}

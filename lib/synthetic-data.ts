const syntheticReferencePattern = /^(?:SYN|TEST|DEMO)-[A-Z0-9][A-Z0-9._-]*$/i;

export function isSyntheticReference(value: string): boolean {
  return syntheticReferencePattern.test(value.trim());
}

export function syntheticReferenceError(field: "patient" | "appointment"): string {
  return `Synthetic-data pilot mode requires the ${field} reference to begin with SYN-, TEST-, or DEMO-.`;
}

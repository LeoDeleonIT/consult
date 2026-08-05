export const STAFF_SPEAKER_ROLES = ["doctor", "treatment_coordinator", "assistant"] as const;

export type StaffSpeakerRole = typeof STAFF_SPEAKER_ROLES[number];

export function staffSpeakerRoleLabel(role: StaffSpeakerRole | null | undefined): string {
  if (role === "doctor") return "Doctor";
  if (role === "assistant") return "Dental assistant";
  return "Treatment coordinator";
}

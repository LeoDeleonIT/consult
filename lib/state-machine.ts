import type { ConsultationStatus } from "./types";

const transitions: Record<ConsultationStatus, ConsultationStatus[]> = {
  draft: ["consented", "deleted"],
  consented: ["recording", "deleted"],
  recording: ["uploaded", "consented", "deleted"],
  uploaded: ["processing", "failed", "deleted"],
  processing: ["review_required", "failed", "deleted"],
  review_required: ["submitted", "processing", "deleted"],
  submitted: ["deleted"],
  failed: ["processing", "deleted"],
  deleted: [],
};

export function canTransition(from: ConsultationStatus, to: ConsultationStatus): boolean {
  return transitions[from].includes(to);
}

export function assertTransition(from: ConsultationStatus, to: ConsultationStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid consultation state transition: ${from} -> ${to}`);
  }
}

export function canStartRecording(status: ConsultationStatus, consentedAt: string | null): boolean {
  return status === "consented" && Boolean(consentedAt);
}

export function processingDisposition(
  status: ConsultationStatus,
  hasAnalysis: boolean,
): "start" | "return_existing" | "return_in_progress" | "reject" {
  if (hasAnalysis && ["review_required", "submitted"].includes(status)) return "return_existing";
  if (status === "processing") return "return_in_progress";
  if (["uploaded", "failed", "review_required"].includes(status)) return "start";
  return "reject";
}

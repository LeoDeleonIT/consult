import type { ConsultationStatus } from "@/lib/types";

const labels: Record<ConsultationStatus, string> = {
  draft: "Draft",
  consented: "Ready to record",
  recording: "Recording",
  uploaded: "Uploaded",
  processing: "Processing",
  review_required: "Needs review",
  submitted: "Submitted",
  failed: "Needs attention",
  deleted: "Deleted",
};

export function StatusBadge({ status }: { status: ConsultationStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}

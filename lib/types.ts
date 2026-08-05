export type Role = "coordinator" | "manager";

export type ConsultationStatus =
  | "draft"
  | "consented"
  | "recording"
  | "uploaded"
  | "processing"
  | "review_required"
  | "submitted"
  | "failed"
  | "deleted";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locationId: string | null;
  locationName: string | null;
};

export type TranscriptSegment = {
  startSeconds: number;
  endSeconds: number;
  speaker: "coordinator" | "patient" | "unknown";
  text: string;
};

export type NormalizedTranscript = {
  text: string;
  language: string | null;
  durationSeconds: number | null;
  segments: TranscriptSegment[];
  speakerMapping?: "provided" | "inferred_turn_order" | "unavailable";
};

export type ProviderStatus = {
  provider: "openai" | "fixture" | "invalid";
  mode: "live" | "demo" | "unavailable";
  ready: boolean;
  transcriptionModel: string | null;
  message: string;
};

export type ChecklistItem = {
  key: string;
  label: string;
};

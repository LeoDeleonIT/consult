import { z } from "zod";

export type NormalizedTranscript = {
  text: string;
  language: string | null;
  durationSeconds: number | null;
  speakerMapping: "unconfirmed" | "unavailable";
  segments: Array<{
    startSeconds: number;
    endSeconds: number;
    speaker: "unknown";
    speakerLabel: string | null;
    text: string;
  }>;
};

const transcribeOutputSchema = z.object({
  results: z.object({
    transcripts: z.array(z.object({ transcript: z.string() })).default([]),
    items: z.array(z.object({
      type: z.enum(["pronunciation", "punctuation"]),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      speaker_label: z.string().optional(),
      alternatives: z.array(z.object({ content: z.string().min(1) })).min(1),
    })).min(1),
  }),
});

export function normalizeAwsTranscribe(payload: unknown, language = "en-US"): NormalizedTranscript {
  const parsed = transcribeOutputSchema.parse(payload);
  const segments: NormalizedTranscript["segments"] = [];
  let active: NormalizedTranscript["segments"][number] | null = null;
  for (const item of parsed.results.items) {
    const content = item.alternatives[0].content;
    if (item.type === "punctuation") {
      if (active) active.text = `${active.text}${content}`;
      continue;
    }
    const startSeconds = timestamp(item.start_time);
    const endSeconds = timestamp(item.end_time);
    const speakerLabel = item.speaker_label ?? "unlabeled";
    if (!active || active.speakerLabel !== speakerLabel) {
      if (active) segments.push(active);
      active = { startSeconds, endSeconds, speaker: "unknown", speakerLabel, text: content };
    } else {
      active.text = `${active.text} ${content}`;
      active.endSeconds = endSeconds;
    }
  }
  if (active) segments.push(active);
  if (!segments.length) throw new Error("transcription_output_invalid");
  const suppliedText = parsed.results.transcripts.map((entry) => entry.transcript.trim()).filter(Boolean).join("\n");
  return {
    text: suppliedText || segments.map((segment) => segment.text).join(" "),
    language,
    durationSeconds: Math.max(...segments.map((segment) => segment.endSeconds)),
    speakerMapping: new Set(segments.map((segment) => segment.speakerLabel).filter(Boolean)).size ? "unconfirmed" : "unavailable",
    segments,
  };
}

function timestamp(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("transcription_timestamp_invalid");
  return parsed;
}

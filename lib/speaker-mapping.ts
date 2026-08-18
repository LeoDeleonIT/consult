import type { NormalizedTranscript } from "./types";

export type SpeakerMappingInput = {
  staffSpeakerLabel: string;
  patientSpeakerLabel: string;
};

export function rawSpeakerLabels(transcript: NormalizedTranscript): string[] {
  return [...new Set(transcript.segments.map((segment) => segment.speakerLabel).filter((value): value is string => Boolean(value)))];
}

export function applySpeakerMapping(transcript: NormalizedTranscript, mapping: SpeakerMappingInput): NormalizedTranscript {
  if (!mapping.staffSpeakerLabel || !mapping.patientSpeakerLabel || mapping.staffSpeakerLabel === mapping.patientSpeakerLabel) {
    throw new Error("Choose two different recorded voices.");
  }
  const labels = new Set(rawSpeakerLabels(transcript));
  if (!labels.has(mapping.staffSpeakerLabel) || !labels.has(mapping.patientSpeakerLabel)) {
    throw new Error("The selected voice label is not present in this transcript.");
  }
  return {
    ...transcript,
    speakerMapping: "provided",
    segments: transcript.segments.map((segment) => ({
      ...segment,
      speaker: segment.speakerLabel === mapping.staffSpeakerLabel
        ? "coordinator"
        : segment.speakerLabel === mapping.patientSpeakerLabel
          ? "patient"
          : "unknown",
    })),
  };
}

import type { NormalizedTranscript } from "@/lib/types";
import { matchConversationTag, TRACKED_TERM_SPLITTER, type ConversationTag } from "@/lib/conversation-tags";
import { staffSpeakerRoleLabel, type StaffSpeakerRole } from "@/lib/speaker-roles";

export function TranscriptView({
  transcript,
  highlightTags = [],
  staffSpeakerRole = "treatment_coordinator",
}: {
  transcript: NormalizedTranscript;
  highlightTags?: ConversationTag[];
  staffSpeakerRole?: StaffSpeakerRole;
}) {
  const staffLabel = staffSpeakerRoleLabel(staffSpeakerRole);
  return (
    <div>
      {transcript.speakerMapping === "unconfirmed" && (
        <p className="transcript-warning">Voice labels are not identities. Listen to the recording and confirm which voice is staff and which is the patient before approval.</p>
      )}
      {transcript.speakerMapping === "unavailable" && (
        <p className="transcript-warning">The provider did not return usable speaker labels. This draft cannot be submitted until the transcript is reviewed and corrected.</p>
      )}
      <div className="transcript">
        {transcript.segments.length ? transcript.segments.map((segment, index) => (
          <div className="transcript-row" key={`${segment.startSeconds}-${index}`}>
            <span className={`speaker speaker-${segment.speaker}`}>{segment.speaker === "coordinator" ? staffLabel : segment.speaker === "patient" ? "Patient" : segment.speakerLabel ?? "Unknown"}</span>
            <div>
              <small>{formatSeconds(segment.startSeconds)}</small>
              <p><HighlightedTerms text={segment.text} tags={highlightTags} /></p>
            </div>
          </div>
        )) : <p className="transcript-plain"><HighlightedTerms text={transcript.text} tags={highlightTags} /></p>}
      </div>
    </div>
  );
}

function HighlightedTerms({ text, tags }: { text: string; tags: ConversationTag[] }) {
  if (!tags.length) return text;
  const active = new Set(tags.map((tag) => tag.key));
  return text.split(TRACKED_TERM_SPLITTER).map((part, index) => {
    const tag = matchConversationTag(part);
    return tag && active.has(tag.key)
      ? <mark className="keyword-highlight" data-keyword={tag.key} key={`${part}-${index}`}>{part}</mark>
      : part;
  });
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

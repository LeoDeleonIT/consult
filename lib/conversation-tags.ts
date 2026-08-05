export type ConversationTagKey = "payment_plans" | "sunbit" | "cherry" | "care_credit";

export type ConversationTag = {
  key: ConversationTagKey;
  label: string;
};

export const TRACKED_CONVERSATION_TAGS: ConversationTag[] = [
  { key: "payment_plans", label: "Payment Plans" },
  { key: "sunbit", label: "Sunbit" },
  { key: "cherry", label: "Cherry" },
  { key: "care_credit", label: "Care Credit" },
];

const matchers: Record<ConversationTagKey, RegExp> = {
  payment_plans: /\bpayment\s+plans?\b/i,
  sunbit: /\bsun\s*bit\b/i,
  cherry: /\bcherry\b/i,
  care_credit: /\bcare\s*credit\b/i,
};

export const TRACKED_TERM_SPLITTER = /(\bpayment\s+plans?\b|\bsun\s*bit\b|\bcherry\b|\bcare\s*credit\b)/gi;

export function detectConversationTags(...content: Array<string | null | undefined>): ConversationTag[] {
  const text = content.filter(Boolean).join("\n");
  return TRACKED_CONVERSATION_TAGS.filter((tag) => matchers[tag.key].test(text));
}

export function matchConversationTag(text: string): ConversationTag | null {
  return TRACKED_CONVERSATION_TAGS.find((tag) => matchers[tag.key].test(text)) ?? null;
}

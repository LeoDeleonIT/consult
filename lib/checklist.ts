import type { ChecklistItem } from "./types";

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: "treatment_explained", label: "Recommended treatment was explained." },
  { key: "benefit_discussed", label: "Reason or benefit for treatment was discussed." },
  { key: "alternatives_discussed", label: "Alternatives were discussed when applicable." },
  { key: "cost_discussed", label: "Estimated cost was discussed." },
  { key: "insurance_estimate", label: "Insurance amounts were described as estimates rather than guarantees." },
  { key: "financing_offered", label: "Financing or payment options were offered." },
  { key: "questions_invited", label: "The patient was invited to ask questions." },
  { key: "concerns_addressed", label: "Patient concerns or objections were addressed." },
  { key: "next_step", label: "A specific next step was established." },
  { key: "follow_up_owner", label: "Follow-up responsibility was identified." },
];

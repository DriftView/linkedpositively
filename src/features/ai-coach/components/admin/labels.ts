import type { AiAlertCategory, AiAlertLevel, AiAlertSource, AiAlertStatus, AiTopic } from "@/server/db/schema/ai";

export const LEVEL_LABEL: Record<AiAlertLevel, string> = {
  urgent: "Urgent",
  elevated: "Safety concern",
  support: "Wants a person",
};

export const LEVEL_CLASS: Record<AiAlertLevel, string> = {
  urgent: "bg-destructive text-white",
  elevated: "bg-warning/20 text-foreground",
  support: "bg-brand-sky/20 text-foreground",
};

export const CATEGORY_LABEL: Record<AiAlertCategory, string> = {
  suicide: "Suicide risk",
  self_harm: "Self-harm",
  violence: "Violence",
  abuse: "Abuse or assault",
  overdose: "Overdose",
  medical: "Medical / PEP window",
  human_request: "Asked for a person",
  other: "Other",
};

export const SOURCE_LABEL: Record<AiAlertSource, string> = {
  keywords: "Keyword check",
  classifier: "AI safety review",
  assistant: "Raised by the coach",
};

export const STATUS_LABEL: Record<AiAlertStatus, string> = {
  open: "New",
  in_review: "In review",
  resolved: "Resolved",
};

export const TOPIC_LABEL: Record<AiTopic, string> = {
  hiv: "HIV",
  prep: "PrEP",
  pep: "PEP",
  testing: "Testing",
  treatment: "Treatment & care",
  sexual_health: "Sexual health",
  mental_health: "Mental health",
  trauma: "Trauma",
  substance_use: "Substance use",
  wellness: "Wellness",
  other: "Other",
};

import type {
  AiCoachAppearance,
  AiCoachLook,
  AiCoachPronouns,
  AiCoachTone,
  AiCoachVoice,
  AiReplyLength,
  AI_COACH_EARRINGS,
  AI_COACH_FACIAL_HAIR,
  AI_COACH_GLASSES,
  AI_COACH_HAIR_COLORS,
  AI_COACH_HAIRS,
  AI_COACH_OUTFIT_COLORS,
  AI_COACH_OUTFITS,
  AI_COACH_SKINS,
} from "@/server/db/schema/ai";

/**
 * The coach a member designs: name, pronouns, look, voice and style. Every
 * option is a fixed choice (labels, colors and voice ids live here), so a
 * design changes how the coach looks and sounds, never its safety rules.
 * Client-safe; no server imports.
 */

/** What the member chose. Null fields fall back to the starting look. */
export type CoachDesign = {
  look: AiCoachLook;
  name: string | null;
  pronouns: AiCoachPronouns | null;
  appearance: AiCoachAppearance | null;
  voice: AiCoachVoice | null;
  tone: AiCoachTone;
  replyLength: AiReplyLength;
};

/** The design with every gap filled in: what the app shows and says. */
export type ResolvedCoach = {
  name: string;
  pronouns: AiCoachPronouns;
  appearance: AiCoachAppearance;
  voice: AiCoachVoice;
  tone: AiCoachTone;
  replyLength: AiReplyLength;
};

type Option<T extends string> = { id: T; label: string };

export const COACH_PRESETS: {
  id: AiCoachLook;
  name: string;
  pronouns: AiCoachPronouns;
  voice: AiCoachVoice;
  appearance: AiCoachAppearance;
}[] = [
  {
    id: "amara",
    name: "Amara",
    pronouns: "she",
    voice: "gentle",
    appearance: {
      skin: "t6",
      hair: "curls",
      hairColor: "black",
      facialHair: "none",
      glasses: "none",
      earrings: "hoops",
      outfit: "tee",
      outfitColor: "magenta",
    },
  },
  {
    id: "jordan",
    name: "Jordan",
    pronouns: "he",
    voice: "easygoing",
    appearance: {
      skin: "t4",
      hair: "fade",
      hairColor: "dark_brown",
      facialHair: "stubble",
      glasses: "none",
      earrings: "none",
      outfit: "hoodie",
      outfitColor: "sky",
    },
  },
  {
    id: "luis",
    name: "Luis",
    pronouns: "he",
    voice: "warm",
    appearance: {
      skin: "t3",
      hair: "waves",
      hairColor: "dark_brown",
      facialHair: "mustache",
      glasses: "square",
      earrings: "none",
      outfit: "collar",
      outfitColor: "apricot",
    },
  },
  {
    id: "kai",
    name: "Kai",
    pronouns: "they",
    voice: "relaxed",
    appearance: {
      skin: "t2",
      hair: "locs",
      hairColor: "brown",
      facialHair: "none",
      glasses: "round",
      earrings: "studs",
      outfit: "tee",
      outfitColor: "plum",
    },
  },
];

export function coachPreset(id: string | null | undefined) {
  return COACH_PRESETS.find((preset) => preset.id === id) ?? COACH_PRESETS[0];
}

export const DEFAULT_DESIGN: CoachDesign = {
  look: "amara",
  name: null,
  pronouns: null,
  appearance: null,
  voice: null,
  tone: "warm",
  replyLength: "balanced",
};

export function resolveCoach(design: CoachDesign): ResolvedCoach {
  const preset = coachPreset(design.look);
  return {
    name: design.name?.trim() || preset.name,
    pronouns: design.pronouns ?? preset.pronouns,
    appearance: design.appearance ?? preset.appearance,
    voice: design.voice ?? preset.voice,
    tone: design.tone,
    replyLength: design.replyLength,
  };
}

/** Coach names: letters (any language), spaces, apostrophes, dots and hyphens. Nothing that reads like an instruction. */
export const COACH_NAME_PATTERN = /^\p{L}[\p{L}\p{M}' .-]{0,19}$/u;

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/** Skin tones, light to deep, with a shade for ears and neck and a lip color that reads on that tone. */
export const SKIN_TONES: Record<(typeof AI_COACH_SKINS)[number], { label: string; base: string; shade: string; lip: string }> = {
  t1: { label: "Tone 1", base: "#f9dcc4", shade: "#e7bfa0", lip: "#b5536a" },
  t2: { label: "Tone 2", base: "#f1c27d", shade: "#d9a862", lip: "#a84a5e" },
  t3: { label: "Tone 3", base: "#e0ac69", shade: "#c48f50", lip: "#9c4255" },
  t4: { label: "Tone 4", base: "#c68642", shade: "#a86d33", lip: "#8a3848" },
  t5: { label: "Tone 5", base: "#a86b3c", shade: "#8c552c", lip: "#7a2e3a" },
  t6: { label: "Tone 6", base: "#8d5524", shade: "#6f4119", lip: "#7a2e3a" },
  t7: { label: "Tone 7", base: "#6b3e1d", shade: "#552f14", lip: "#c06a78" },
  t8: { label: "Tone 8", base: "#4a2a14", shade: "#3a200e", lip: "#c97582" },
};

export const HAIR_STYLES: Option<(typeof AI_COACH_HAIRS)[number]>[] = [
  { id: "curls", label: "Curls" },
  { id: "afro", label: "Afro" },
  { id: "fade", label: "Fade" },
  { id: "buzz", label: "Buzz cut" },
  { id: "waves", label: "Waves" },
  { id: "long", label: "Long" },
  { id: "locs", label: "Locs" },
  { id: "bun", label: "Bun" },
  { id: "braids", label: "Braids" },
  { id: "hijab", label: "Hijab" },
  { id: "bald", label: "Bald" },
];

export const HAIR_COLORS: Record<(typeof AI_COACH_HAIR_COLORS)[number], { label: string; color: string }> = {
  black: { label: "Black", color: "#1f1410" },
  dark_brown: { label: "Dark brown", color: "#3b2416" },
  brown: { label: "Brown", color: "#5a3825" },
  auburn: { label: "Auburn", color: "#8a3b1f" },
  blonde: { label: "Blonde", color: "#d9b06a" },
  gray: { label: "Gray", color: "#a3a3a3" },
  plum: { label: "Plum", color: "#6b2d6b" },
  teal: { label: "Teal", color: "#1f7a7a" },
};

export const FACIAL_HAIR: Option<(typeof AI_COACH_FACIAL_HAIR)[number]>[] = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "mustache", label: "Mustache" },
  { id: "beard", label: "Beard" },
];

export const GLASSES: Option<(typeof AI_COACH_GLASSES)[number]>[] = [
  { id: "none", label: "None" },
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
];

export const EARRINGS: Option<(typeof AI_COACH_EARRINGS)[number]>[] = [
  { id: "none", label: "None" },
  { id: "studs", label: "Studs" },
  { id: "hoops", label: "Hoops" },
];

export const OUTFITS: Option<(typeof AI_COACH_OUTFITS)[number]>[] = [
  { id: "tee", label: "T-shirt" },
  { id: "hoodie", label: "Hoodie" },
  { id: "collar", label: "Collared shirt" },
];

export const OUTFIT_COLORS: Record<(typeof AI_COACH_OUTFIT_COLORS)[number], { label: string; color: string }> = {
  magenta: { label: "Magenta", color: "var(--brand-magenta)" },
  sky: { label: "Sky", color: "var(--brand-sky)" },
  apricot: { label: "Apricot", color: "var(--brand-apricot)" },
  plum: { label: "Plum", color: "var(--brand-plum)" },
  green: { label: "Green", color: "#2f8f5b" },
  charcoal: { label: "Charcoal", color: "#3d3d46" },
};

// ---------------------------------------------------------------------------
// Voice and style
// ---------------------------------------------------------------------------

/**
 * Voices from ElevenLabs' default voice library (available to every account).
 * Labels describe the sound, not a gender. `pitch` tunes the browser's own
 * voice when ElevenLabs isn't available.
 */
export const COACH_VOICES: { id: AiCoachVoice; label: string; elevenLabsId: string; pitch: number }[] = [
  { id: "gentle", label: "Gentle, higher", elevenLabsId: "EXAVITQu4vr4xnSDxMaL", pitch: 1.15 },
  { id: "lively", label: "Lively, higher", elevenLabsId: "cgSgspJ2msm6clMCkdW9", pitch: 1.2 },
  { id: "upbeat", label: "Upbeat, higher", elevenLabsId: "FGY2WhTYpPnrIDTdsKH5", pitch: 1.1 },
  { id: "relaxed", label: "Relaxed, in between", elevenLabsId: "SAz9YHcvj6GT2YYXdXww", pitch: 1 },
  { id: "easygoing", label: "Easygoing, lower", elevenLabsId: "iP95p4xoKVk53GoZ742B", pitch: 0.9 },
  { id: "warm", label: "Warm, lower", elevenLabsId: "TX3LPaxmHKxFdv7VOQHJ", pitch: 0.9 },
  { id: "deep", label: "Deep and calm", elevenLabsId: "nPczCjzI2devNBz1zQrb", pitch: 0.8 },
  { id: "british", label: "British, lower", elevenLabsId: "JBFqnCBsd6RMkjVDRZzb", pitch: 0.85 },
];

export function coachVoice(id: string | null | undefined) {
  return COACH_VOICES.find((voice) => voice.id === id) ?? COACH_VOICES[0];
}

/** Said by every voice in the designer's preview (fixed, so previews can be cached). */
export const VOICE_PREVIEW_TEXT = "Hi, I'm your Link Positively coach. I'm here whenever you want to talk.";

export const PRONOUN_OPTIONS: Option<AiCoachPronouns>[] = [
  { id: "she", label: "she/her" },
  { id: "he", label: "he/him" },
  { id: "they", label: "they/them" },
];

export const TONE_OPTIONS: (Option<AiCoachTone> & { hint: string })[] = [
  { id: "warm", label: "Warm", hint: "Kind and caring" },
  { id: "upbeat", label: "Upbeat", hint: "Cheerful and encouraging" },
  { id: "calm", label: "Calm", hint: "Slow, steady and soothing" },
  { id: "direct", label: "Direct", hint: "Straight to the point" },
];

export const LENGTH_OPTIONS: (Option<AiReplyLength> & { hint: string })[] = [
  { id: "brief", label: "Short", hint: "A few sentences" },
  { id: "balanced", label: "Medium", hint: "The usual" },
  { id: "detailed", label: "Detailed", hint: "More explanation" },
];

import type {
  AiCoachAppearance,
  AiCoachId,
  AiCoachPronouns,
  AiCoachTone,
  AiCoachVoice,
  AiReplyLength,
  AI_COACH_EYE_COLORS,
  AI_COACH_HAIR_COLORS,
  AI_COACH_OUTFIT_COLORS,
  AI_COACH_SKINS,
} from "@/server/db/schema/ai";

/**
 * The coaches a member can choose from. Each coach is fixed: name, pronouns,
 * voice, photo and video face come from this file, so a member picks a coach
 * and a style (tone, reply length) but never changes who the coach is or its
 * safety rules. Client-safe; no server imports.
 */

/** One coach. To add a coach: add its id to AI_COACH_IDS (schema/ai.ts, plus a migration) and an entry here. */
export type Coach = {
  id: AiCoachId;
  name: string;
  pronouns: AiCoachPronouns;
  voice: AiCoachVoice;
  /** Portrait in /public, shown when the video coach is available. */
  photo: string;
  /** Where the face sits in the photo (CSS object-position), so round crops keep it centered. */
  photoFocus: string;
  /** The Anam avatar that plays this coach on video. */
  anamAvatarId: string;
  /** The drawn coach: used when video isn't available or drops mid-call. */
  appearance: AiCoachAppearance;
};

export const COACHES: Coach[] = [
  {
    id: "mina",
    name: "Mina",
    pronouns: "she",
    voice: "gentle",
    photo: "/coaches/mina.webp",
    photoFocus: "50% 30%",
    anamAvatarId: "65bdc796-f739-47fe-9a48-1134dc3ddae4",
    appearance: {
      skin: "t6",
      hair: "curls",
      hairColor: "black",
      eyeColor: "dark_brown",
      facialHair: "none",
      glasses: "none",
      earrings: "none",
      outfit: "tee",
      outfitColor: "navy",
    },
  },
  {
    id: "marcus",
    name: "Marcus",
    pronouns: "he",
    voice: "easygoing",
    photo: "/coaches/marcus.webp",
    photoFocus: "50% 35%",
    anamAvatarId: "70ad4c25-12fb-413d-95d4-001276289e57",
    appearance: {
      skin: "t6",
      hair: "fade",
      hairColor: "black",
      eyeColor: "dark_brown",
      facialHair: "beard",
      glasses: "none",
      earrings: "none",
      outfit: "tee",
      outfitColor: "charcoal",
    },
  },
  {
    id: "elena",
    name: "Elena",
    pronouns: "she",
    voice: "lively",
    photo: "/coaches/elena.webp",
    photoFocus: "50% 40%",
    anamAvatarId: "d31f717f-8d94-4a23-b3d4-76cb4d44fad5",
    appearance: {
      skin: "t3",
      hair: "long",
      hairColor: "black",
      eyeColor: "brown",
      facialHair: "none",
      glasses: "none",
      earrings: "studs",
      outfit: "tee",
      outfitColor: "apricot",
    },
  },
  {
    id: "arthur",
    name: "Arthur",
    pronouns: "he",
    voice: "deep",
    photo: "/coaches/arthur.webp",
    photoFocus: "50% 35%",
    anamAvatarId: "28dbb8df-f8e3-4df0-9bee-9563731bcc38",
    appearance: {
      skin: "t5",
      hair: "fade",
      hairColor: "gray",
      eyeColor: "dark_brown",
      facialHair: "beard",
      glasses: "round",
      earrings: "none",
      outfit: "collar",
      outfitColor: "navy",
    },
  },
  {
    id: "mei",
    name: "Mei",
    pronouns: "she",
    voice: "upbeat",
    photo: "/coaches/mei.webp",
    photoFocus: "50% 38%",
    anamAvatarId: "9dad37f1-977b-44b2-a895-19027d205259",
    appearance: {
      skin: "t2",
      hair: "long",
      hairColor: "black",
      eyeColor: "dark_brown",
      facialHair: "none",
      glasses: "none",
      earrings: "none",
      outfit: "tee",
      outfitColor: "sky",
    },
  },
  {
    id: "liam",
    name: "Liam",
    pronouns: "he",
    voice: "warm",
    photo: "/coaches/liam.webp",
    photoFocus: "50% 35%",
    anamAvatarId: "09d9760a-7c0c-4edc-b50e-da9befaf7309",
    appearance: {
      skin: "t1",
      hair: "waves",
      hairColor: "brown",
      eyeColor: "hazel",
      facialHair: "stubble",
      glasses: "none",
      earrings: "none",
      outfit: "hoodie",
      outfitColor: "green",
    },
  },
];

export function findCoach(id: string | null | undefined) {
  return COACHES.find((coach) => coach.id === id) ?? COACHES[0];
}

/** What the member chose. */
export type CoachDesign = {
  coachId: AiCoachId;
  tone: AiCoachTone;
  replyLength: AiReplyLength;
};

/** The chosen coach with the member's style: what the app shows and says. */
export type ResolvedCoach = Coach & { tone: AiCoachTone; replyLength: AiReplyLength };

type Option<T extends string> = { id: T; label: string };

export const DEFAULT_DESIGN: CoachDesign = {
  coachId: COACHES[0].id,
  tone: "warm",
  replyLength: "balanced",
};

export function resolveCoach(design: CoachDesign): ResolvedCoach {
  return { ...findCoach(design.coachId), tone: design.tone, replyLength: design.replyLength };
}

// ---------------------------------------------------------------------------
// Drawn coach colors
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

/** Eye colors: the iris's mid tone (its texture adds the pupil, fibers and a darker rim). */
export const EYE_COLORS: Record<(typeof AI_COACH_EYE_COLORS)[number], { label: string; color: string }> = {
  dark_brown: { label: "Dark brown", color: "#5a3420" },
  brown: { label: "Brown", color: "#8a5630" },
  hazel: { label: "Hazel", color: "#8f7a3c" },
  green: { label: "Green", color: "#5f8a4a" },
  blue: { label: "Blue", color: "#5b8fc4" },
  gray: { label: "Gray", color: "#8a979f" },
};

/** The coach's eye color; appearances without one have dark brown eyes. */
export function coachEyeColor(appearance: AiCoachAppearance) {
  return EYE_COLORS[appearance.eyeColor ?? "dark_brown"].color;
}

export const OUTFIT_COLORS: Record<(typeof AI_COACH_OUTFIT_COLORS)[number], { label: string; color: string }> = {
  magenta: { label: "Magenta", color: "var(--brand-magenta)" },
  sky: { label: "Sky", color: "var(--brand-sky)" },
  apricot: { label: "Apricot", color: "var(--brand-apricot)" },
  plum: { label: "Plum", color: "var(--brand-plum)" },
  green: { label: "Green", color: "#2f8f5b" },
  charcoal: { label: "Charcoal", color: "#3d3d46" },
  navy: { label: "Navy", color: "#2c3a66" },
};

// ---------------------------------------------------------------------------
// Voice and style
// ---------------------------------------------------------------------------

/**
 * Voices from ElevenLabs' default voice library (available to every account).
 * Each coach has one. `pitch` tunes the browser's own voice when ElevenLabs
 * isn't available.
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

/** Said in the coach picker's "Hear" preview (fixed, so previews can be cached). */
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

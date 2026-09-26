/**
 * Sheep personalities: a temperament and a look, derived only from what you can see (phenotype), so they
 * never give away hidden genes. Deterministic: the same sheep always gets the same words.
 */
import { FOX_GUARD_BOLDNESS } from "./config.js";
import type { Sheep } from "./types.js";

export type Personality = "shy" | "calm" | "curious" | "bold";
export type Flavour = "fluffy" | "stocky" | "dainty" | "curly" | "silky";

export const PERSONALITY_WORD: Record<Personality, string> = { shy: "Shy", calm: "Calm", curious: "Curious", bold: "Bold" };
export const PERSONALITY_ICON: Record<Personality, string> = { shy: "🌸", calm: "🍃", curious: "🔎", bold: "🦁" };

/** Boldness 0–10 → temperament. Bold starts where the fox guard does, so "bold" always means foxes keep away. */
export function personalityFromBoldness(boldness: number): Personality {
  if (!Number.isFinite(boldness)) return "calm";
  if (boldness >= FOX_GUARD_BOLDNESS) return "bold";
  if (boldness >= 5.25) return "curious";
  if (boldness >= 3.5) return "calm";
  return "shy";
}

export function personalityOf(s: Pick<Sheep, "phenotype">): Personality {
  return personalityFromBoldness(Number(s.phenotype["boldness"]));
}

/** Up to two words about how the sheep looks: fluffy, stocky, dainty, curly, silky. */
export function flavoursOf(s: Pick<Sheep, "phenotype">): Flavour[] {
  const p = s.phenotype;
  const out: Flavour[] = [];
  const fw = Number(p["fleeceWeight"]), size = Number(p["size"]), crimp = Number(p["crimp"]), fin = Number(p["fineness"]);
  if (fw >= 5) out.push("fluffy");
  if (size >= 70) out.push("stocky");
  else if (size < 48) out.push("dainty");
  if (crimp >= 6.6) out.push("curly");
  if (fin < 20) out.push("silky");
  return out.slice(0, 2);
}

const LINES: Record<Personality, string[]> = {
  shy: [
    "keeps to the fence and watches from a distance.",
    "hides behind the others when you come by.",
    "takes a while to trust a new face.",
    "jumps at the gate latch, then creeps back for a scratch.",
  ],
  calm: [
    "nothing much ruffles this one.",
    "happiest with a mouthful of clover.",
    "the steady one the lambs lean on.",
    "chews slowly and thinks deep thoughts.",
  ],
  curious: [
    "always first to the gate.",
    "has to sniff every new thing.",
    "follows whoever is getting the attention.",
    "pokes a nose into every bucket.",
  ],
  bold: [
    "marches right up to say hello. Foxes keep away.",
    "roams the whole field and fears nothing.",
    "stares down foxes and dogs alike.",
    "the flock's self-appointed guard.",
  ],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** "Curious — always first to the gate." One line per sheep, picked by id so renaming keeps it. */
export function personalityLine(s: Pick<Sheep, "id" | "phenotype">): string {
  const p = personalityOf(s);
  const lines = LINES[p];
  return `${PERSONALITY_WORD[p]} — ${lines[hash(s.id) % lines.length]}`;
}

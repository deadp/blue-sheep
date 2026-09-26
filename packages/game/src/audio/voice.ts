/**
 * Sheep voices: the pure mapping from what a sheep is (age, sex, size, temperament, id) to how it bleats.
 * No WebAudio here, so it can be unit-tested; `engine.ts` turns a Voice into sound.
 *
 * Every sheep gets a stable voice: the same sheep always sounds the same, and two sheep of the same kind
 * still differ a little (pitch, vowel, wobble speed) by a hash of their id. Lambs squeak high and short,
 * ewes sit in the middle, rams are low and long; bigger sheep are a touch lower. Temperament shapes the
 * delivery: shy is soft, breathy and falling (sometimes one tiny "meh"), calm a steady mellow "baaa",
 * curious rises like a question and often bleats twice, bold is loud and rough and sometimes goes "BAA-A-A".
 */

export type VoicePersonality = "shy" | "calm" | "curious" | "bold";
export type AgeClass = "lamb" | "adult" | "old";

export interface VoiceInput {
  id: string;
  sex: "ewe" | "ram";
  adult: boolean;
  /** Age in seasons (optional). Adults of three years or more get a slightly older, wobblier voice. */
  ageSeasons?: number;
  /** kg, typically 40–80 */
  size: number;
  personality?: VoicePersonality;
}

export interface Voice {
  id: string;
  age: AgeClass;
  sex: "ewe" | "ram";
  personality: VoicePersonality;
  /** fundamental frequency at the start of the bleat (Hz) */
  pitch: number;
  /** pitch glide over one bleat, semitones (+ rises like a question, − falls) */
  glide: number;
  /** seconds for one bleat */
  duration: number;
  /** 0..1 peak level before the master volume */
  loudness: number;
  /** 0..1: pitch jitter, growl and drive */
  roughness: number;
  /** 0..1: breath noise mixed in */
  breath: number;
  /** vibrato / bleat tremolo rate (Hz) */
  vibratoRate: number;
  /** vibrato depth in semitones */
  vibratoDepth: number;
  /** amplitude tremolo depth 0..1 (the "a-a-a" in a baa) */
  tremolo: number;
  /** formant centres (Hz): F1, F2, F3 of the vowel */
  formants: [number, number, number];
  /** "baa" opens from a lip closure (fast attack); "meh" hums in through the nose (soft attack) */
  vowel: "baa" | "meh";
  /** attack time (s) */
  attack: number;
}

/** One bleat in a series: offsets relative to the voice. */
export interface BleatStep {
  /** seconds after the series starts */
  at: number;
  /** multiplies the voice duration */
  dur: number;
  /** multiplies the voice pitch */
  pitch: number;
  /** multiplies the loudness */
  gain: number;
  /** overrides the glide (semitones) */
  glide: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** FNV-1a, so voices don't depend on any other module's hash. */
export function voiceHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Small deterministic generator from the id (mulberry32). */
function idRng(id: string): () => number {
  let a = voiceHash(id) ^ 0xb1ea7;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Base { pitch: number; duration: number; formant: number; vibrato: number; loud: number }
/** By age and sex. Pitch ranges never overlap: the id and size nudges stay inside ±~14 %. */
const BASE: Record<"lamb-ewe" | "lamb-ram" | "ewe" | "ram", Base> = {
  "lamb-ewe": { pitch: 480, duration: 0.42, formant: 1.3, vibrato: 8.5, loud: 0.8 },
  "lamb-ram": { pitch: 445, duration: 0.45, formant: 1.26, vibrato: 8.2, loud: 0.82 },
  ewe: { pitch: 235, duration: 0.7, formant: 1.0, vibrato: 6.6, loud: 0.9 },
  ram: { pitch: 142, duration: 0.95, formant: 0.84, vibrato: 5.6, loud: 1.0 },
};

interface Temper {
  pitch: number; glide: number; duration: number; loudness: number; roughness: number;
  breath: number; vibDepth: number; tremolo: number; vowel: "baa" | "meh"; attack: number;
}
const TEMPER: Record<VoicePersonality, Temper> = {
  shy: { pitch: 1.06, glide: -3, duration: 0.62, loudness: 0.42, roughness: 0.06, breath: 0.55, vibDepth: 0.45, tremolo: 0.22, vowel: "meh", attack: 0.07 },
  calm: { pitch: 1.0, glide: -0.6, duration: 1.0, loudness: 0.66, roughness: 0.14, breath: 0.16, vibDepth: 0.3, tremolo: 0.32, vowel: "baa", attack: 0.035 },
  curious: { pitch: 1.03, glide: 3.5, duration: 0.82, loudness: 0.74, roughness: 0.22, breath: 0.14, vibDepth: 0.4, tremolo: 0.36, vowel: "baa", attack: 0.025 },
  bold: { pitch: 0.94, glide: -1.2, duration: 1.25, loudness: 1.0, roughness: 0.62, breath: 0.1, vibDepth: 0.6, tremolo: 0.5, vowel: "baa", attack: 0.015 },
};

/** Vowel formants for an adult ewe; scaled by the vocal-tract factor. */
const VOWEL: Record<"baa" | "meh", [number, number, number]> = {
  baa: [820, 1250, 2650],
  meh: [560, 1750, 2600],
};

/** The stable voice of one sheep. */
export function voiceFor(s: VoiceInput): Voice {
  const personality: VoicePersonality = s.personality ?? "calm";
  const age: AgeClass = !s.adult ? "lamb" : (s.ageSeasons ?? 0) >= 12 ? "old" : "adult";
  const base = BASE[age === "lamb" ? (s.sex === "ram" ? "lamb-ram" : "lamb-ewe") : s.sex];
  const T = TEMPER[personality];
  const r = idRng(s.id);
  const u = () => r() * 2 - 1; // −1..1
  const size = Number.isFinite(s.size) ? s.size : 60;
  // bigger sheep, lower voice: about −3 % per 10 kg, capped at ±7 %
  const sizeK = clamp(1 - (size - 60) * 0.0035, 0.93, 1.07);
  const idK = 1 + u() * 0.06;
  const oldK = age === "old" ? 0.95 : 1;
  const pitch = base.pitch * sizeK * idK * T.pitch * oldK;
  const tract = base.formant * (1 + u() * 0.05) * clamp(1 - (size - 60) * 0.002, 0.95, 1.05);
  const [f1, f2, f3] = VOWEL[T.vowel];
  return {
    id: s.id, age, sex: s.sex, personality,
    pitch: round(pitch, 1),
    glide: round(T.glide + u() * 0.6, 2),
    duration: round(base.duration * T.duration * (1 + u() * 0.08), 3),
    loudness: round(clamp(T.loudness * base.loud * (1 + u() * 0.05), 0.1, 1), 3),
    roughness: round(clamp(T.roughness + (s.sex === "ram" && s.adult ? 0.08 : 0) + (age === "old" ? 0.08 : 0) + u() * 0.04, 0, 1), 3),
    breath: round(clamp(T.breath + (age === "old" ? 0.08 : 0) + u() * 0.04, 0, 1), 3),
    vibratoRate: round(base.vibrato * (1 + u() * 0.12) * (age === "old" ? 0.85 : 1), 2),
    vibratoDepth: round(T.vibDepth * (1 + u() * 0.2) * (age === "old" ? 1.5 : 1), 3),
    tremolo: round(clamp(T.tremolo * (1 + u() * 0.2) + (age === "old" ? 0.1 : 0), 0, 0.85), 3),
    formants: [round(f1 * tract, 0), round(f2 * tract * (1 + u() * 0.04), 0), round(f3 * tract, 0)],
    vowel: T.vowel,
    attack: T.attack,
  };
}

/**
 * A "series of sounds": one to three bleats. Mostly set by temperament, with a little cosmetic randomness
 * (`rnd` defaults to Math.random; pass a fixed function for tests or offline renders).
 */
export function bleatSeries(v: Voice, rnd: () => number = Math.random): BleatStep[] {
  const x = rnd();
  const one = (dur = 1): BleatStep[] => [{ at: 0, dur, pitch: 1, gain: 1, glide: v.glide }];
  switch (v.personality) {
    case "shy":
      // mostly one soft falling bleat; sometimes just a tiny "meh"
      return x < 0.35 ? [{ at: 0, dur: 0.45, pitch: 1.04, gain: 0.8, glide: v.glide * 0.5 }] : one();
    case "calm":
      return x < 0.8 ? one() : [
        { at: 0, dur: 0.8, pitch: 1, gain: 1, glide: v.glide },
        { at: v.duration * 0.8 + 0.22, dur: 1, pitch: 0.97, gain: 0.85, glide: v.glide - 0.5 },
      ];
    case "curious": {
      // a double bleat, the second asking the question
      if (x < 0.25) return one();
      return [
        { at: 0, dur: 0.55, pitch: 1, gain: 0.9, glide: 0.6 },
        { at: v.duration * 0.55 + 0.12, dur: 0.9, pitch: 1.05, gain: 1, glide: v.glide },
      ];
    }
    case "bold": {
      if (x < 0.45) return one();
      if (x < 0.75) return [
        { at: 0, dur: 0.6, pitch: 1.02, gain: 1, glide: -0.4 },
        { at: v.duration * 0.6 + 0.08, dur: 0.9, pitch: 0.98, gain: 0.95, glide: v.glide },
      ];
      // BAA-A-A: three quick punches, each a step lower
      const d = 0.42;
      return [0, 1, 2].map((i) => ({ at: i * (v.duration * d + 0.045), dur: i === 2 ? d * 1.5 : d, pitch: 1 - i * 0.04, gain: 1 - i * 0.07, glide: i === 2 ? v.glide : -0.3 }));
    }
  }
}

/** Seconds from the first bleat's start to the last bleat's end. */
export function seriesLength(v: Voice, steps: BleatStep[]): number {
  return steps.reduce((m, s) => Math.max(m, s.at + v.duration * s.dur), 0);
}

function round(v: number, dp: number): number {
  const k = 10 ** dp;
  return Math.round(v * k) / k;
}

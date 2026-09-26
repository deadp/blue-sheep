import { petVoiceFor } from "./voice.js";
import { describe, expect, it } from "vitest";
import { bleatSeries, seriesLength, voiceFor, type VoiceInput, type VoicePersonality } from "./voice.js";

const base = (o: Partial<VoiceInput> = {}): VoiceInput => ({ id: "s1", sex: "ewe", adult: true, ageSeasons: 6, size: 60, personality: "calm", ...o });
const PERS: VoicePersonality[] = ["shy", "calm", "curious", "bold"];
const ids = Array.from({ length: 40 }, (_, i) => `sheep-${i * 7919}`);

describe("voiceFor", () => {
  it("is deterministic per sheep", () => {
    expect(voiceFor(base({ id: "abc" }))).toEqual(voiceFor(base({ id: "abc" })));
  });

  it("gives every sheep of the same kind its own voice", () => {
    const pitches = new Set(ids.map((id) => voiceFor(base({ id })).pitch));
    expect(pitches.size).toBeGreaterThan(30);
    const a = voiceFor(base({ id: "a" })), b = voiceFor(base({ id: "b" }));
    expect(a).not.toEqual(b);
    expect(a.personality).toBe(b.personality);
  });

  it("orders pitch lamb > ewe > ram for every id, size and temperament", () => {
    for (const id of ids) for (const personality of PERS) for (const size of [38, 60, 85]) {
      const lamb = voiceFor(base({ id, adult: false, ageSeasons: 1, size: Math.min(size, 50), personality, sex: id.length % 2 ? "ram" : "ewe" }));
      const ewe = voiceFor(base({ id, size, personality }));
      const oldEwe = voiceFor(base({ id, size, personality, ageSeasons: 20 }));
      const ram = voiceFor(base({ id, size, personality, sex: "ram" }));
      expect(lamb.pitch).toBeGreaterThan(ewe.pitch);
      expect(Math.min(ewe.pitch, oldEwe.pitch)).toBeGreaterThan(ram.pitch);
    }
  });

  it("makes lambs short and rams long", () => {
    const lamb = voiceFor(base({ adult: false })), ewe = voiceFor(base()), ram = voiceFor(base({ sex: "ram" }));
    expect(lamb.duration).toBeLessThan(ewe.duration);
    expect(ewe.duration).toBeLessThan(ram.duration);
    expect(lamb.formants[0]).toBeGreaterThan(ram.formants[0]);
  });

  it("lowers the voice of bigger sheep", () => {
    expect(voiceFor(base({ size: 80 })).pitch).toBeLessThan(voiceFor(base({ size: 45 })).pitch);
  });

  it("gives old sheep a wobblier voice", () => {
    const young = voiceFor(base({ ageSeasons: 4 })), old = voiceFor(base({ ageSeasons: 16 }));
    expect(old.age).toBe("old");
    expect(old.vibratoDepth).toBeGreaterThan(young.vibratoDepth);
  });

  it("shapes the delivery by temperament", () => {
    for (const id of ids) {
      const [shy, calm, curious, bold] = PERS.map((personality) => voiceFor(base({ id, personality })));
      // shy: soft, breathy, short, falling, a "meh"
      expect(shy!.loudness).toBeLessThan(calm!.loudness);
      expect(shy!.breath).toBeGreaterThan(calm!.breath);
      expect(shy!.duration).toBeLessThan(calm!.duration);
      expect(shy!.glide).toBeLessThan(-1.5);
      expect(shy!.vowel).toBe("meh");
      // curious: rising like a question
      expect(curious!.glide).toBeGreaterThan(2);
      // bold: loudest, roughest, longest
      expect(bold!.loudness).toBeGreaterThan(curious!.loudness);
      expect(bold!.roughness).toBeGreaterThan(Math.max(shy!.roughness, calm!.roughness, curious!.roughness) + 0.2);
      expect(bold!.duration).toBeGreaterThan(calm!.duration);
    }
  });

  it("treats a missing temperament as calm", () => {
    expect(voiceFor(base({ personality: undefined })).personality).toBe("calm");
  });
});

describe("bleatSeries", () => {
  const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };
  it("picks one to three bleats by temperament", () => {
    const shy = voiceFor(base({ personality: "shy" }));
    const curious = voiceFor(base({ personality: "curious" }));
    const bold = voiceFor(base({ personality: "bold" }));
    expect(bleatSeries(shy, seq([0.1]))).toHaveLength(1); // a tiny "meh"
    expect(bleatSeries(shy, seq([0.1]))[0]!.dur).toBeLessThan(1);
    expect(bleatSeries(curious, seq([0.6]))).toHaveLength(2); // double, the second rising
    expect(bleatSeries(curious, seq([0.6]))[1]!.glide).toBeGreaterThan(0);
    expect(bleatSeries(bold, seq([0.9]))).toHaveLength(3); // BAA-A-A
    for (const v of [shy, curious, bold]) for (let x = 0; x < 1; x += 0.05) {
      const s = bleatSeries(v, seq([x]));
      expect(s.length).toBeGreaterThanOrEqual(1);
      expect(s.length).toBeLessThanOrEqual(3);
      expect(seriesLength(v, s)).toBeLessThan(3);
      for (let i = 1; i < s.length; i++) expect(s[i]!.at).toBeGreaterThan(s[i - 1]!.at);
    }
  });
});

describe("fondness and farm animals", () => {
  const base = { id: "s42", sex: "ewe" as const, adult: true, ageSeasons: 6, size: 60, personality: "calm" as const };

  it("a sheep fond of you keeps its own voice but sounds warmer and says more", () => {
    const cold = voiceFor({ ...base, fondness: 10 });
    const warm = voiceFor({ ...base, fondness: 100 });
    for (const k of ["pitch", "duration", "vibratoRate", "vowel"] as const) expect(warm[k]).toEqual(cold[k]);
    expect(warm.formants).toEqual(cold.formants);
    expect(warm.roughness).toBeLessThan(cold.roughness);
    expect(warm.glide).toBeGreaterThan(cold.glide);
    let coldN = 0, warmN = 0;
    for (let i = 0; i < 200; i++) {
      const r = () => ((i * 7919) % 1000) / 1000;
      coldN += bleatSeries(cold, r).length;
      warmN += bleatSeries(warm, r).length;
    }
    expect(warmN).toBeGreaterThan(coldN);
  });

  it("dogs bark (terrier yaps high, the Maremma booms low) and the cat mews", () => {
    const t = petVoiceFor("terrier"), c = petVoiceFor("collie"), m = petVoiceFor("maremma"), cat = petVoiceFor("cat");
    expect(t.pitch).toBeGreaterThan(c.pitch);
    expect(c.pitch).toBeGreaterThan(m.pitch);
    expect(t.duration).toBeLessThan(0.2);
    expect(cat.duration).toBeGreaterThan(t.duration * 3);
    expect(cat.vowel).toBe("meh");
    expect(bleatSeries(t, () => 0.9).length).toBe(3); // yap-yap-yap
    expect(bleatSeries(m, () => 0.1).length).toBe(1); // one deep WOOF
    expect(bleatSeries(cat, () => 0.9).length).toBeGreaterThanOrEqual(1);
  });
});

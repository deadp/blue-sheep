// Voices probe: we can't listen in a headless browser, so render bleats offline (OfflineAudioContext, in the
// real game build), measure them, and write WAVs for a human to play (out/voices/*.wav).
// Rules checked: every voice renders sound; measured pitch goes lamb > ewe > ram for each temperament and
// sits near the designed pitch; lambs are shorter than rams; shy bleats are quieter than bold ones.
import fs from "node:fs";
import path from "node:path";
import { isMain, runSteps } from "./lib/harness.mjs";
import { ProbeError } from "./lib/browser.mjs";
import { OUT_DIR } from "./lib/paths.mjs";

const AGES = /** @type {const} */ (["lamb", "ewe", "ram"]);
const PERS = /** @type {const} */ (["shy", "calm", "curious", "bold"]);

/** @param {string} age @param {string} personality */
const input = (age, personality) => ({
  id: `voice-${age}-${personality}`, sex: age === "ram" ? "ram" : "ewe", adult: age !== "lamb",
  ageSeasons: age === "lamb" ? 1 : 6, size: age === "lamb" ? 46 : age === "ram" ? 72 : 58, personality,
});

/** Length (s above −40 dB of peak), peak and RMS (dBFS), pitch (Hz, YIN over the loud middle). */
function stats(/** @type {Float32Array} */ x, /** @type {number} */ sr) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const thr = peak * 0.01;
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  let e = 0;
  for (let i = a; i <= b; i++) e += x[i] * x[i];
  const rms = Math.sqrt(e / Math.max(1, b - a + 1));
  // pitch: YIN (cumulative-mean-normalised difference) on frames across the loud middle half, median of frames
  const m0 = a + Math.floor((b - a) * 0.25), m1 = a + Math.floor((b - a) * 0.75);
  const maxLag = Math.ceil(sr / 70), minLag = Math.floor(sr / 1000), W = 1024;
  const f0s = [];
  let clarity = 0;
  for (let st = m0; st + W + maxLag < m1 || (f0s.length === 0 && st + W + maxLag < x.length); st += 512) {
    const d = new Float64Array(maxLag + 1);
    for (let L = 1; L <= maxLag; L++) { let s2 = 0; for (let i = 0; i < W; i++) { const q = x[st + i] - x[st + i + L]; s2 += q * q; } d[L] = s2; }
    let run = 0, lag = 0;
    const dn = new Float64Array(maxLag + 1);
    for (let L = 1; L <= maxLag; L++) { run += d[L]; dn[L] = run > 0 ? (d[L] * L) / run : 1; }
    for (let L = minLag; L < maxLag; L++) if (dn[L] < 0.2) { while (L + 1 < maxLag && dn[L + 1] < dn[L]) L++; lag = L; break; }
    if (!lag) { let m = Infinity; for (let L = minLag; L < maxLag; L++) if (dn[L] < m) { m = dn[L]; lag = L; } }
    clarity += 1 - dn[lag];
    // parabolic interpolation
    const y0 = dn[lag - 1], y1 = dn[lag], y2 = dn[lag + 1];
    const den = y0 - 2 * y1 + y2;
    const frac = den ? (0.5 * (y0 - y2)) / den : 0;
    f0s.push(sr / (lag + (Math.abs(frac) < 1 ? frac : 0)));
  }
  f0s.sort((p, q) => p - q);
  const pitch = f0s.length ? f0s[Math.floor(f0s.length / 2)] : 0;
  clarity = f0s.length ? clarity / f0s.length : 0;
  const db = (/** @type {number} */ v) => 20 * Math.log10(Math.max(1e-9, v));
  return { length: (b - a) / sr, peakDb: db(peak), rmsDb: db(rms), pitch, clarity };
}

function wav(/** @type {Float32Array} */ x, /** @type {number} */ sr) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return buf;
}

/** @type {import("./lib/harness.mjs").Step} */
export const voices = {
  name: "voices",
  async run(ctx) {
    const g = await ctx.newPage();
    await g.boot("?seed=7&fresh=1&nomotion=1");
    const dir = path.join(OUT_DIR, "voices");
    fs.mkdirSync(dir, { recursive: true });
    const render = (/** @type {any} */ who, /** @type {string} */ series = "one") =>
      g.page.evaluate(([w, s]) => /** @type {any} */ (window).__game.debug.renderVoice(w, s), [who, series]);
    /** @type {Record<string, any>} */
    const table = {};
    for (const age of AGES) for (const p of PERS) {
      const out = await render(input(age, p));
      if (!out) throw new ProbeError("OfflineAudioContext is unavailable in the probe browser");
      const x = Float32Array.from(out.samples);
      const st = stats(x, out.sampleRate);
      const v = out.voice;
      const designed = v.pitch * 2 ** (v.glide / 24); // geometric middle of the glide
      table[`${age}-${p}`] = { ...st, designed, voice: v };
      fs.writeFileSync(path.join(dir, `${age}-${p}.wav`), wav(x, out.sampleRate));
      if (st.peakDb < -40) throw new ProbeError(`${age}/${p} rendered silence (peak ${st.peakDb.toFixed(1)} dBFS)`);
      if (st.pitch && Math.abs(st.pitch / designed - 1) > 0.2) throw new ProbeError(`${age}/${p}: measured ${st.pitch.toFixed(0)} Hz, designed ~${designed.toFixed(0)} Hz`);
    }
    // a few "series of sounds" as the game plays them (random 1–3 bleats)
    for (const [age, p] of [["lamb", "curious"], ["ewe", "calm"], ["ram", "bold"], ["ewe", "shy"]]) {
      for (let k = 0; k < 2; k++) {
        const out = await render(input(age, p), "random");
        fs.writeFileSync(path.join(dir, `series-${age}-${p}-${k + 1}.wav`), wav(Float32Array.from(out.samples), out.sampleRate));
      }
    }
    const rows = ["voice          designed  measured  length  peak dB  rms dB"];
    for (const [k, t] of Object.entries(table)) {
      rows.push(`${k.padEnd(14)} ${t.designed.toFixed(0).padStart(6)} Hz ${t.pitch.toFixed(0).padStart(5)} Hz ${t.length.toFixed(2).padStart(6)}s ${t.peakDb.toFixed(1).padStart(7)} ${t.rmsDb.toFixed(1).padStart(7)}`);
    }
    fs.writeFileSync(path.join(dir, "stats.txt"), rows.join("\n") + "\n\n" + JSON.stringify(table, null, 1));
    for (const r of rows) ctx.note(r);
    for (const p of PERS) {
      const [l, e, r] = AGES.map((a) => table[`${a}-${p}`]);
      if (!(l.pitch > e.pitch && e.pitch > r.pitch)) throw new ProbeError(`${p}: measured pitch should go lamb > ewe > ram: ${l.pitch.toFixed(0)} / ${e.pitch.toFixed(0)} / ${r.pitch.toFixed(0)}`);
      if (!(l.length < r.length)) throw new ProbeError(`${p}: a lamb's bleat should be shorter than a ram's (${l.length.toFixed(2)} vs ${r.length.toFixed(2)} s)`);
    }
    for (const a of AGES) {
      const s = table[`${a}-shy`], b = table[`${a}-bold`];
      if (!(s.rmsDb < b.rmsDb - 3)) throw new ProbeError(`${a}: a shy bleat should be clearly quieter than a bold one (${s.rmsDb.toFixed(1)} vs ${b.rmsDb.toFixed(1)} dB)`);
    }
    ctx.artifact(path.join(dir, "stats.txt"));
    g.assertNoErrors("rendering voices");
    await g.close();
  },
};

if (isMain(import.meta.url)) runSteps([voices]);

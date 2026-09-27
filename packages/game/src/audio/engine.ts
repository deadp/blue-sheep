/**
 * WebAudio bleat synth. No audio files: a sawtooth + pulse source with vibrato and jitter, through three
 * bandpass formant filters (the "baa"/"meh" vowel), an amplitude envelope with the bleat tremolo, a little
 * drive for rough voices and optional breath noise.
 *
 * `renderBleat` works on any BaseAudioContext, so the same code plays live and renders offline (probes).
 * The live `Voices` player creates its AudioContext only inside a user gesture (browser autoplay rules) and
 * stays silent, without warnings, where WebAudio is missing.
 */
import { bleatSeries, seriesLength, type BleatStep, type Voice } from "./voice.js";

type Ctx = BaseAudioContext;

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();
function noise(ctx: Ctx): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // cosmetic
    noiseBuffers.set(ctx, b);
  }
  return b;
}

const curves = new Map<number, Float32Array<ArrayBuffer>>();
function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = Math.round(amount * 20) / 20;
  let c = curves.get(k);
  if (!c) {
    c = new Float32Array(new ArrayBuffer(1024 * 4));
    const drive = 1 + k * 6;
    const norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * drive) / norm; }
    curves.set(k, c);
  }
  return c;
}

/** Schedule one bleat into `dest` starting at `t0`. Returns its end time. */
export function renderBleat(ctx: Ctx, dest: AudioNode, v: Voice, t0: number, step: BleatStep): number {
  const dur = Math.max(0.12, v.duration * step.dur);
  const t1 = t0 + dur;
  const f0 = v.pitch * step.pitch;
  const fEnd = f0 * 2 ** (step.glide / 12);
  const nodes: AudioScheduledSourceNode[] = [];

  // ---- source: sawtooth + a quieter pulse an octave-ish below for body
  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  const pulse = ctx.createOscillator();
  pulse.type = "square";
  for (const o of [saw, pulse]) {
    o.frequency.setValueAtTime(f0 * 0.97, t0);
    o.frequency.linearRampToValueAtTime(f0, t0 + Math.min(0.06, dur * 0.2));
    o.frequency.linearRampToValueAtTime(fEnd, t1);
  }
  pulse.detune.value = 4;
  // vibrato: depth in cents on both oscillators
  const vib = ctx.createOscillator();
  vib.frequency.value = v.vibratoRate;
  const vibDepth = ctx.createGain();
  vibDepth.gain.setValueAtTime(v.vibratoDepth * 30, t0);
  vibDepth.gain.linearRampToValueAtTime(v.vibratoDepth * 100, t0 + dur * 0.5);
  vib.connect(vibDepth);
  vibDepth.connect(saw.detune);
  vibDepth.connect(pulse.detune);
  // jitter: a fast irregular wobble (two detuned sines) for rough voices
  const jit = ctx.createOscillator();
  jit.frequency.value = 23 + v.roughness * 17;
  const jit2 = ctx.createOscillator();
  jit2.frequency.value = 37.3;
  const jitDepth = ctx.createGain();
  jitDepth.gain.value = v.roughness * 70;
  jit.connect(jitDepth);
  jit2.connect(jitDepth);
  jitDepth.connect(saw.detune);
  jitDepth.connect(pulse.detune);
  nodes.push(saw, pulse, vib, jit, jit2);

  const src = ctx.createGain();
  const sawG = ctx.createGain(); sawG.gain.value = 0.7;
  const pulG = ctx.createGain(); pulG.gain.value = 0.18 + v.roughness * 0.25;
  saw.connect(sawG).connect(src);
  pulse.connect(pulG).connect(src);

  // ---- drive (roughness) before the vocal tract
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(v.roughness);
  src.connect(shaper);

  // ---- formants: three parallel bandpasses; F1 opens from the lips ("b") or hums in ("m")
  const tract = ctx.createGain();
  const [F1, F2, F3] = v.formants;
  const fGain = [1.0, 0.55, 0.22];
  const Q = [5, 8, 11];
  [F1, F2, F3].forEach((f, i) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = Q[i]!;
    if (i === 0) {
      bp.frequency.setValueAtTime(f * (v.vowel === "baa" ? 0.45 : 0.6), t0);
      bp.frequency.linearRampToValueAtTime(f, t0 + (v.vowel === "baa" ? 0.05 : 0.12));
      bp.frequency.linearRampToValueAtTime(f * 0.9, t1);
    } else if (i === 1) {
      bp.frequency.setValueAtTime(f * (v.vowel === "meh" ? 0.8 : 0.95), t0);
      bp.frequency.linearRampToValueAtTime(f, t0 + 0.1);
    } else bp.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = fGain[i]! * 3;
    shaper.connect(bp).connect(g).connect(tract);
  });
  // a little low body straight through (nasal "m" gets more)
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = Math.max(300, v.pitch * 2.2);
  const lowG = ctx.createGain();
  lowG.gain.value = v.vowel === "meh" ? 0.35 : 0.18;
  shaper.connect(low).connect(lowG).connect(tract);

  // ---- breath noise, shaped like the vowel
  if (v.breath > 0.02) {
    const n = ctx.createBufferSource();
    n.buffer = noise(ctx);
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = F2 * 1.3;
    nf.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.value = v.breath * 0.9;
    n.connect(nf).connect(ng).connect(tract);
    nodes.push(n);
  }

  // ---- amplitude: envelope × tremolo
  const env = ctx.createGain();
  const peak = v.loudness * step.gain * 0.5;
  const atk = v.attack;
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  env.gain.setValueAtTime(peak, t0 + atk);
  env.gain.linearRampToValueAtTime(peak * 0.75, Math.max(t0 + atk + 0.01, t1 - 0.09));
  env.gain.exponentialRampToValueAtTime(0.0001, t1);
  const trem = ctx.createGain();
  trem.gain.value = 1 - v.tremolo / 2;
  const tremLfo = ctx.createOscillator();
  tremLfo.frequency.value = v.vibratoRate;
  const tremDepth = ctx.createGain();
  tremDepth.gain.value = v.tremolo / 2;
  tremLfo.connect(tremDepth).connect(trem.gain);
  nodes.push(tremLfo);
  tract.connect(trem).connect(env).connect(dest);

  for (const s of nodes) { s.start(t0); s.stop(t1 + 0.02); }
  saw.onended = () => { try { env.disconnect(); } catch { /* already gone */ } };
  return t1;
}

/** Schedule a whole series. Returns the end time. */
export function renderSeries(ctx: Ctx, dest: AudioNode, v: Voice, t0: number, steps: BleatStep[]): number {
  let end = t0;
  for (const s of steps) end = Math.max(end, renderBleat(ctx, dest, v, t0 + s.at, s));
  return end;
}

/** What the last bleat was, for probes (`__game.debug.lastSound()`). */
export interface SoundRecord extends Voice {
  steps: BleatStep[];
  /** seconds of sound */
  length: number;
  /** why it was quiet, when it was */
  played: boolean;
  reason?: "muted" | "no-audio" | "locked" | "busy";
  /** effective level after the master volume */
  level: number;
  at: number;
}

const SOUND_KEY = "blue-sheep-sound";
const VOLUME_KEY = "blue-sheep-volume";
const MAX_VOICES = 4;
const DEBOUNCE_MS = 350;

type AudioCtor = typeof AudioContext;
function audioCtor(): AudioCtor | null {
  const w = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** The live player: settings (saved in localStorage, not the game), a voice cap and a debounce. */
export class Voices {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private busyUntil: number[] = [];
  private lastById = new Map<string, number>();
  private last: SoundRecord | null = null;
  on: boolean;
  volume: number;

  constructor() {
    this.on = read(SOUND_KEY, "1") !== "0";
    const v = Number(read(VOLUME_KEY, "0.7"));
    this.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
    if (typeof window !== "undefined") {
      const unlock = () => this.unlock();
      for (const ev of ["pointerdown", "keydown", "touchend"]) window.addEventListener(ev, unlock, { capture: true, passive: true });
    }
  }

  /** Called from a user gesture: create or resume the context. */
  unlock(): void {
    if (!this.on) return;
    try {
      if (!this.ctx) {
        const C = audioCtor();
        if (!C) return;
        this.ctx = new C({ latencyHint: "interactive" });
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        // gentle limiter so choruses never clip
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  setOn(on: boolean): void {
    this.on = on;
    write(SOUND_KEY, on ? "1" : "0");
    if (!on && this.ctx) void this.ctx.suspend().catch(() => undefined);
    if (on) this.unlock();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.7));
    write(VOLUME_KEY, String(this.volume));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  lastSound(): SoundRecord | null { return this.last ? { ...this.last, steps: this.last.steps.map((s) => ({ ...s })) } : null; }

  /**
   * One sheep says something. `steps` defaults to a series chosen by its temperament; `delay` (s) and
   * `gain` shape choruses. Repeated calls for the same sheep within a moment, or beyond the voice cap, are
   * dropped (but still recorded) so clicking about never turns into a din.
   */
  bleat(v: Voice, opts: { steps?: BleatStep[]; delay?: number; gain?: number; force?: boolean } = {}): SoundRecord {
    const steps = opts.steps ?? bleatSeries(v);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const length = seriesLength(v, steps);
    const rec: SoundRecord = { ...v, steps, length, played: false, level: v.loudness * (opts.gain ?? 1) * (this.on ? this.volume : 0), at: now };
    const prev = this.lastById.get(v.id);
    if (!opts.force && prev !== undefined && now - prev < DEBOUNCE_MS) { rec.reason = "busy"; return this.record(rec); }
    this.lastById.set(v.id, now);
    if (!this.on || this.volume <= 0) { rec.reason = "muted"; return this.record(rec); }
    if (!this.ctx || !this.master) { rec.reason = audioCtor() ? "locked" : "no-audio"; return this.record(rec); }
    if (this.ctx.state !== "running") { rec.reason = "locked"; return this.record(rec); }
    const t = this.ctx.currentTime;
    this.busyUntil = this.busyUntil.filter((e) => e > t);
    if (this.busyUntil.length >= MAX_VOICES) { rec.reason = "busy"; return this.record(rec); }
    try {
      const g = this.ctx.createGain();
      g.gain.value = opts.gain ?? 1;
      g.connect(this.master);
      const end = renderSeries(this.ctx, g, v, t + 0.01 + (opts.delay ?? 0), steps);
      this.busyUntil.push(end);
      setTimeout(() => { try { g.disconnect(); } catch { /* gone */ } }, (end - t + 0.3) * 1000);
      rec.played = true;
    } catch {
      rec.reason = "no-audio";
    }
    return this.record(rec);
  }

  /**
   * A soft brush stroke: a short burst of filtered noise (no voice). Quiet, cosmetic; skipped when muted or
   * locked. Returns true if it played.
   */
  swish(gain = 0.35): boolean {
    if (!this.on || this.volume <= 0 || !this.ctx || !this.master || this.ctx.state !== "running") return false;
    try {
      const t = this.ctx.currentTime + 0.005;
      const src = this.ctx.createBufferSource();
      src.buffer = noise(this.ctx);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.linearRampToValueAtTime(4200, t + 0.16);
      bp.Q.value = 0.9;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t, Math.random() * 1.2); // cosmetic
      src.stop(t + 0.22);
      return true;
    } catch {
      return false;
    }
  }

  private record(r: SoundRecord): SoundRecord {
    this.last = r;
    return r;
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}

/**
 * Render a voice offline (no speakers, no gesture needed): mono samples at `sampleRate`. For probes that
 * can't listen: they measure length, level and pitch, and write WAVs for a human.
 */
export async function renderOffline(v: Voice, steps: BleatStep[], sampleRate = 44100): Promise<Float32Array | null> {
  const w = globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext };
  if (!w.OfflineAudioContext) return null;
  const len = seriesLength(v, steps) + 0.15;
  const ctx = new w.OfflineAudioContext(1, Math.ceil(len * sampleRate), sampleRate);
  const g = ctx.createGain();
  g.connect(ctx.destination);
  renderSeries(ctx, g, v, 0.02, steps);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

function read(k: string, d: string): string {
  try { return localStorage.getItem(k) ?? d; } catch { return d; }
}
function write(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* private mode */ }
}

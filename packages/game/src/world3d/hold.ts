/**
 * Press-and-hold (brushing a sheep's live portrait, patting a dog or the cat): the same gesture on mouse, pen
 * and touch. Holding for HOLD_MS fills a ring above the finger and completes; letting go early cancels
 * without effect. Timed with a clock (not animation frames), so it works with reduced motion and in
 * headless browsers. Cosmetic only: the caller decides what a completed hold does.
 */

/** How long a brushing or a pat takes (ms). */
export const HOLD_MS = 1200;
/** A press shorter than this is still a click (a bleat), not a cancelled brushing. */
export const HOLD_CLICK_MS = 250;

export interface HoldHandlers {
  /** About every 40 ms while held: progress 0–1 and where the pointer is (client px). */
  onTick?: (p: number, x: number, y: number) => void;
  /** The hold completed. */
  onDone: () => void;
  /** Let go early (progress 0–1 when released). */
  onCancel?: (p: number) => void;
}

export class Hold {
  private t0 = 0;
  private timer = 0;
  private ring: HTMLElement | null = null;
  private x = 0;
  private y = 0;
  private done = false;
  /** Progress of the current (or last) hold, 0–1. */
  progress = 0;
  /** Milliseconds held in the current (or last) hold. */
  heldMs = 0;

  constructor(private readonly host: HTMLElement, private readonly h: HoldHandlers, private readonly ms = HOLD_MS) {}

  get active(): boolean { return this.timer !== 0; }
  /** The progress ring is on screen. */
  get ringShown(): boolean { return !!this.ring?.isConnected; }

  down(x: number, y: number): void {
    this.cancelSilently();
    this.t0 = performance.now();
    this.x = x; this.y = y;
    this.done = false;
    this.progress = 0;
    this.heldMs = 0;
    const r = document.createElement("div");
    r.className = "hold-ring";
    r.setAttribute("aria-hidden", "true");
    r.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48"><circle class="hr-track" cx="24" cy="24" r="19"/><circle class="hr-fill" cx="24" cy="24" r="19" pathLength="100"/></svg><span class="hr-heart">♥</span>`;
    this.host.appendChild(r);
    this.ring = r;
    this.place();
    this.timer = window.setInterval(() => this.tick(), 40);
  }

  move(x: number, y: number): void {
    if (!this.active) return;
    this.x = x; this.y = y;
    this.place();
  }

  /** Let go: true if the hold had completed. */
  up(): boolean {
    if (this.done) return true;
    if (!this.active) return false;
    this.tick();
    if (this.done) return true;
    const p = this.progress;
    this.stop();
    this.fade("cancel");
    this.h.onCancel?.(p);
    return false;
  }

  dispose(): void { this.cancelSilently(); }

  private cancelSilently(): void {
    this.stop();
    this.ring?.remove();
    this.ring = null;
  }

  private stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private tick(): void {
    if (!this.active) return;
    this.heldMs = performance.now() - this.t0;
    this.progress = Math.min(1, this.heldMs / this.ms);
    this.ring?.style.setProperty("--p", this.progress.toFixed(3));
    this.h.onTick?.(this.progress, this.x, this.y);
    if (this.progress >= 1 && !this.done) {
      this.done = true;
      this.stop();
      this.fade("done");
      this.h.onDone();
    }
  }

  private fade(cls: "done" | "cancel"): void {
    const r = this.ring;
    this.ring = null;
    if (!r) return;
    r.style.setProperty("--p", cls === "done" ? "1" : this.progress.toFixed(3));
    r.classList.add(cls);
    window.setTimeout(() => r.remove(), cls === "done" ? 700 : 250);
  }

  /** The ring sits just above the pointer (so a finger doesn't hide it), kept inside the host. */
  private place(): void {
    const r = this.ring;
    if (!r) return;
    const b = this.host.getBoundingClientRect();
    const x = Math.max(26, Math.min(b.width - 26, this.x - b.left));
    const y = Math.max(26, Math.min(b.height - 26, this.y - b.top - 52));
    r.style.left = `${Math.round(x)}px`;
    r.style.top = `${Math.round(y)}px`;
  }
}

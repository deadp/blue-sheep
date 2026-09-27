// Movement prototype: a coarse walkability grid over the round-3 farm plus A* with string-pulling.
// Fences, buildings, trees, the creek and locked land block; gates are gaps. Cells are 0.5 units.
import { AREAS, bushScore, creekV, FLATS_GATE, type UV } from "../r3/farm.js";

export const CELL = 0.5;
const U0 = -60, U1 = 96, V0 = -17.5, V1 = 14;
const NU = Math.ceil((U1 - U0) / CELL), NV = Math.ceil((V1 - V0) / CELL);

/** Trees and props that stand in the walkable strip (u, v, radius). */
const POSTS: [number, number, number][] = [
  [-36, 6, 0.9], [-50, 7, 0.6], [-54, -2, 0.9], [-33, -13, 1.1], [-4, 7, 0.6], [16, 8, 0.9], [47, -11, 0.6],
  [-8, -11, 0.9], [18, -11, 0.9], [-26, 12.5, 0.9], [-12, 12, 0.8], [8, 12, 0.8], [10, 11.5, 0.6], [72, -11, 0.6],
  [-27.5, 6.8, 1.1], [-9, 6.5, 0.9], // home trough and bale
  [-8.5, -12.3, 0.4], // mailbox
];

export class Grid {
  readonly nu = NU;
  readonly nv = NV;
  private cells = new Uint8Array(NU * NV); // 0 walkable, 1 blocked
  flatsOpen = false;

  constructor() { this.rebuild(); }

  openFlats() { this.flatsOpen = true; this.rebuild(); }

  private rebuild() {
    const c = this.cells;
    c.fill(0);
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const u = U0 + (i + 0.5) * CELL, v = V0 + (j + 0.5) * CELL;
      let b = false;
      if (v > creekV(u) - 2.8) b = true; // the creek and everything beyond (no bridge yet)
      if (u > 58 && bushScore(u, v) > 0.55) b = true; // the bush edge
      if (u < -33 && v > 8.5) b = true; // macrocarpa shelter belt
      if (u > -49.5 && u < -37 && v > -5 && v < 5) b = true; // homestead
      if (u > -7.2 && u < 13.4 && v > -1.8 && v < 5.4) b = true; // woolshed and lean-to
      if (u > -0.8 && u < 9.4 && v > -6.4 && v < -1.6) b = true; // verandah, benches and perches
      if (u > 13.4 && u < 21.6 && v > -1.6 && v < 4.6) b = true; // yards
      if (u > 8 && u < 13.2 && v > -4.2 && v < -1.6) b = true; // ramp and wool bales
      const r = AREAS.rushy.rect!;
      if (u > r[0] - 0.4 && u < r[1] + 0.4 && v > r[2] - 0.4 && v < r[3] + 0.4) b = true;
      const f = AREAS.flats.rect!;
      if (!this.flatsOpen && u > f[0] - 0.4 && u < f[1] + 0.4 && v > f[2] - 0.4 && v < f[3] + 0.4) b = true;
      for (const [pu, pv, pr] of POSTS) if (Math.hypot(u - pu, v - pv) < pr) b = true;
      if (b) c[j * NU + i] = 1;
    }
    const h = AREAS.home.rect!;
    // home paddock fence with the gate on the east side (swung open, so passable)
    this.line([h[0], h[3]], [h[1], h[3]]);
    this.line([h[1], h[3]], [h[1], -4 + 1.9]);
    this.line([h[1], -4 - 1.9], [h[1], h[2]]);
    this.line([h[1], h[2]], [h[0], h[2]]);
    this.line([h[0], h[2]], [h[0], h[3]]);
    this.line([-52, -7], [-36, -7]); // homestead garden fence
    this.line([-6.2, -5.8], [-9.4, -5.8]); // the open gate leaf
    if (this.flatsOpen) {
      const f = AREAS.flats.rect!;
      this.line([f[0], FLATS_GATE + 1.9], [f[0], f[3]]);
      this.line([f[0], f[3]], [f[1], f[3]]);
      this.line([f[1], f[3]], [f[1], f[2]]);
      this.line([f[1], f[2]], [f[0], f[2]]);
      this.line([f[0], f[2]], [f[0], FLATS_GATE - 1.9]);
    }
  }

  private line(a: UV, b: UV) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL * 0.4));
    for (let k = 0; k <= n; k++) {
      const u = a[0] + ((b[0] - a[0]) * k) / n, v = a[1] + ((b[1] - a[1]) * k) / n;
      for (const du of [-0.3, 0, 0.3]) for (const dv of [-0.3, 0, 0.3]) {
        const [i, j] = this.cell(u + du, v + dv);
        if (this.inside(i, j)) this.cells[j * NU + i] = 1;
      }
    }
  }

  cell(u: number, v: number): [number, number] { return [Math.floor((u - U0) / CELL), Math.floor((v - V0) / CELL)]; }
  centre(i: number, j: number): UV { return [U0 + (i + 0.5) * CELL, V0 + (j + 0.5) * CELL]; }
  inside(i: number, j: number) { return i >= 0 && j >= 0 && i < NU && j < NV; }
  blockedCell(i: number, j: number) { return !this.inside(i, j) || this.cells[j * NU + i] === 1; }
  blocked(u: number, v: number) { const [i, j] = this.cell(u, v); return this.blockedCell(i, j); }

  /** The nearest walkable point to (u, v), searching outwards ring by ring. */
  nearestFree(u: number, v: number): UV | null {
    const [ci, cj] = this.cell(u, v);
    if (!this.blockedCell(ci, cj)) return [u, v];
    for (let r = 1; r < 40; r++) {
      let best: UV | null = null, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || this.blockedCell(ci + di, cj + dj)) continue;
        const p = this.centre(ci + di, cj + dj), d = Math.hypot(p[0] - u, p[1] - v);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) return best;
    }
    return null;
  }

  /** Straight walk clear of blocked cells (sampled every quarter cell, with a little body width). */
  clear(a: UV, b: UV): boolean {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / (CELL * 0.25)));
    const nx = -(b[1] - a[1]) / (d || 1) * 0.22, ny = (b[0] - a[0]) / (d || 1) * 0.22;
    for (let k = 0; k <= n; k++) {
      const u = a[0] + ((b[0] - a[0]) * k) / n, v = a[1] + ((b[1] - a[1]) * k) / n;
      if (this.blocked(u, v) || this.blocked(u + nx, v + ny) || this.blocked(u - nx, v - ny)) return false;
    }
    return true;
  }

  /** A* over 8-connected cells (no corner cutting), then string-pulled to a few waypoints. */
  path(from: UV, to: UV): UV[] | null {
    const goal = this.nearestFree(to[0], to[1]);
    const start = this.nearestFree(from[0], from[1]);
    if (!goal || !start) return null;
    if (this.clear(from, goal)) return [goal];
    const [si, sj] = this.cell(start[0], start[1]), [gi, gj] = this.cell(goal[0], goal[1]);
    const N = NU * NV;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap: [number, number][] = []; // [f, index]
    const push = (f: number, k: number) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= heap[i]![0]) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
    };
    const pop = () => {
      const top = heap[0]!, last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m;
        }
      }
      return top;
    };
    const hh = (i: number, j: number) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const s = sj * NU + si, e = gj * NU + gi;
    g[s] = 0;
    push(hh(si, sj), s);
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === e) { found = true; break; }
      const i = k % NU, j = (k - i) / NU;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (this.blockedCell(ni, nj)) continue;
        if (di && dj && (this.blockedCell(i + di, j) || this.blockedCell(i, j + dj))) continue;
        const nk = nj * NU + ni;
        const ng = g[k]! + (di && dj ? Math.SQRT2 : 1);
        if (ng < g[nk]!) { g[nk] = ng; came[nk] = k; push(ng + hh(ni, nj), nk); }
      }
    }
    if (!found) return null;
    const raw: UV[] = [];
    for (let k = e; k !== -1 && k !== s; k = came[k]!) { const i = k % NU; raw.push(this.centre(i, (k - i) / NU)); }
    raw.reverse();
    raw[raw.length - 1] = goal;
    // string pulling: skip every waypoint we can see past
    const out: UV[] = [];
    let cur: UV = from;
    let idx = 0;
    while (idx < raw.length) {
      let far = idx;
      for (let t = raw.length - 1; t > idx; t--) if (this.clear(cur, raw[t]!)) { far = t; break; }
      out.push(raw[far]!);
      cur = raw[far]!;
      idx = far + 1;
    }
    return out;
  }
}

// A coarse walkability grid over the valley plus A* with string-pulling (ported from the movement prototype).
// Fences, buildings, trees, the creek and locked land block; gates are gaps; the bridge crosses the creek once
// the far bank is open. Cells are 0.5 units. Cosmetic (the farmer's walk), so nothing here touches game state.
import { AREAS, AREA_IDS, BRIDGE, BUSH_AT, FENCES, SOLIDS, TREES, areaFence, bushScore, creekV, treeRadius, type AreaId, type UV } from "./valley.js";

export const CELL = 0.5;
const U0 = -70, U1 = 96, V0 = -31, V1 = 36;
const NU = Math.ceil((U1 - U0) / CELL), NV = Math.ceil((V1 - V0) / CELL);

export class Grid {
  readonly nu = NU;
  readonly nv = NV;
  private cells = new Uint8Array(NU * NV); // 0 walkable, 1 blocked
  private open = new Set<AreaId>(["home"]);

  constructor() { this.rebuild(); }

  setOpen(open: Iterable<AreaId>): void {
    const next = new Set<AreaId>(["home", ...open]);
    if (next.size === this.open.size && [...next].every((a) => this.open.has(a))) return;
    this.open = next;
    this.rebuild();
  }

  isOpen(id: AreaId): boolean { return this.open.has(id); }

  private rebuild(): void {
    const c = this.cells;
    c.fill(0);
    const farbank = this.open.has("farbank");
    const fb = AREAS.farbank.rect;
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const u = U0 + (i + 0.5) * CELL, v = V0 + (j + 0.5) * CELL;
      let b = false;
      const cv = creekV(u);
      if (v > cv - 2.8) {
        // the creek and the far side: only the bridge and the far bank (once it's open) are walkable
        const onBridge = farbank && Math.abs(u - BRIDGE[0]) < 1.05 && v < cv + 3.2;
        const onBank = farbank && v >= cv + 2.6 && u > fb[0] - 0.6 && u < fb[1] + 0.6 && v < fb[3] + 0.6;
        b = !(onBridge || onBank);
      }
      if (u > 58 && bushScore(u, v) > BUSH_AT - 0.05) b = true;
      if (v < -30 || u < -68) b = true;
      for (const r of SOLIDS) if (u > r[0] && u < r[1] && v > r[2] && v < r[3]) { b = true; break; }
      for (const id of AREA_IDS) {
        if (this.open.has(id)) continue;
        const r = AREAS[id].rect;
        if (u > r[0] - 0.4 && u < r[1] + 0.4 && v > r[2] - 0.4 && v < r[3] + 0.4) b = true;
      }
      if (!b) for (const [, tu, tv, s] of TREES) if (Math.abs(u - tu) < 3 && Math.abs(v - tv) < 3 && Math.hypot(u - tu, v - tv) < treeRadius("", s) * 0.8) { b = true; break; }
      if (b) c[j * NU + i] = 1;
    }
    for (const id of AREA_IDS) if (this.open.has(id)) for (const [a, b] of areaFence(AREAS[id])) this.line(a, b);
    for (const [a, b] of FENCES) this.line(a, b);
    // the woolshed yards' fence and the verandah edge are inside SOLIDS already
  }

  private line(a: UV, b: UV): void {
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
  inside(i: number, j: number): boolean { return i >= 0 && j >= 0 && i < NU && j < NV; }
  blockedCell(i: number, j: number): boolean { return !this.inside(i, j) || this.cells[j * NU + i] === 1; }
  blocked(u: number, v: number): boolean { const [i, j] = this.cell(u, v); return this.blockedCell(i, j); }

  /** The nearest walkable point to (u, v), searching outwards ring by ring. */
  nearestFree(u: number, v: number): UV | null {
    const [ci, cj] = this.cell(u, v);
    if (!this.blockedCell(ci, cj)) return [u, v];
    for (let r = 1; r < 60; r++) {
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
    const nx = (-(b[1] - a[1]) / (d || 1)) * 0.22, ny = ((b[0] - a[0]) / (d || 1)) * 0.22;
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
    const heap: [number, number][] = [];
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
    if (!raw.length) return [goal];
    raw[raw.length - 1] = goal;
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

/** Sheep card and family tree. */
import {
  FAIR_LABEL, PERSONALITY_ICON, PERSONALITY_WORD, TREAT_COST, canBreed, factsFor, familyTree, flavoursOf, fleeceAt, fondWoolMultiplier, fondnessOf,
  forecastTreat, greetedThisSeason, isAdult, isIll, personalityLine, personalityOf, sheepValue, treatBlocked, treatedThisSeason,
  type AncestorNode, type DescendantNode, type GameState, type Sheep, type TreeNode,
} from "../core/index.js";
import { ageWords, chip, dot, esc, has, heartMeter, hex, numbersOn, portrait, sexMark, swatch, traitWords } from "./util.js";

/** Pastel backdrop per wool colour for the live portrait (matches the world's portrait backgrounds). */
const PORTRAIT_BG: Record<string, string> = { white: "#bfdcec", black: "#f5dcc4", brown: "#d4e9c6", blue: "#f7e2c2", fawn: "#cfdcf2" };
const FLAVOUR_ICON: Record<string, string> = { fluffy: "☁️", stocky: "🪨", dainty: "🌼", curly: "➰", silky: "✨" };
import type { View } from "./view.js";

export function cardSubject(state: GameState, view: View): Sheep | null {
  const s = view.sheepId ? state.sheep[view.sheepId] : undefined;
  return s ?? (state.flock[0] ? state.sheep[state.flock[0]]! : null);
}

/**
 * The care box: how fond the animal is of you (hearts), whether you've said hello this season, what its
 * happiness does for its wool, and the treat: its forecast next to the button (Decide → Forecast → Commit).
 */
export function careHtml(state: GameState, id: string, effect: string): string {
  const level = fondnessOf(state, id);
  const treated = treatedThisSeason(state, id);
  const fc = treated ? null : forecastTreat(state, id);
  const blocked = treatBlocked(state, id);
  const said = greetedThisSeason(state, id) ? `<span class="c-said">♥ said hello this season</span>` : "";
  const act = treated
    ? `<span class="tag ok">Treat given ✓</span>`
    : `<button class="secondary treat" data-treat="${esc(id)}" ${blocked ? "disabled" : ""}>Give a treat · ${TREAT_COST} coin</button>${blocked && state.money < TREAT_COST ? `<span class="meta">Not enough coins</span>` : ""}`;
  return `<div class="care" data-care="${esc(id)}">
    <div class="c-top"><span class="c-lbl">Fondness</span>${heartMeter(state, level, fc && fc.after > level ? { to: fc.after } : {})}${said}</div>
    ${effect ? `<div class="c-wool">${effect}</div>` : ""}
    <div class="c-fore">${treated ? "Had a treat this season. Say hello again next season." : esc(fc!.text)}</div>
    <div class="c-act">${act}</div>
  </div>`;
}

/** What this sheep's fondness does for its wool, in a short sentence (coins; % only with numbers). */
function woolEffect(state: GameState, s: Sheep): string {
  const her = s.sex === "ram" ? "His" : "Her";
  if (!isAdult(s, state.season)) return "Too young to shear. Lambs raised with kindness grow into happy sheep.";
  const level = fondnessOf(state, s.id);
  const m = fondWoolMultiplier(level);
  const d = fleeceAt(state, s, level) - fleeceAt(state, s, 30);
  const pct = numbersOn(state) && Math.abs(m - 1) > 0.001 ? ` (${m > 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)}%)` : "";
  if (m > 1.001) return d > 0 ? `💗 Happy sheep grow better wool: ${her.toLowerCase()} fleece fetches about <b>+${d} coin${d === 1 ? "" : "s"}</b> a shearing${pct}.` : `💗 A happy sheep: ${her.toLowerCase()} wool is getting better${pct}.`;
  if (m < 0.999) return `😟 Skittish sheep grow poorer wool: ${her.toLowerCase()} fleece fetches ${d < 0 ? `about <b>−${-d} coin${d === -1 ? "" : "s"}</b>` : "a little less"} a shearing${pct}. Say hello!`;
  return `${her} wool fetches the usual price. Once ${s.sex === "ram" ? "he" : "she"} is fond of you, it fetches more.`;
}

export function sheepCardHtml(state: GameState, view: View): string {
  const s = cardSubject(state, view);
  if (!s) return `<h2>No sheep</h2><p>Your fields are empty. The market has sheep for sale.</p>`;
  const own = state.flock.includes(s.id);
  const forSale = state.market.includes(s.id);
  const visitor = state.visitingRam?.id === s.id;
  const dam = s.dam ? state.sheep[s.dam] : undefined, sire = s.sire ? state.sheep[s.sire] : undefined;
  const parents = dam || sire
    ? `${dam ? chip(state, dam) : "unknown"} × ${sire ? chip(state, sire) : "unknown"}`
    : `<span class="meta">${s.origin === "founder" ? "one of the old farm's flock — no records" : s.origin === "visitor" ? "from over the hills — no records" : "bought in — no pedigree"}</span>`;
  const kids = Object.values(state.sheep).filter((k) => k.dam === s.id || k.sire === s.id);
  const facts = factsFor(state, s.id).filter((f) => !(f.locus === "A" && s.phenotype["colour"] !== "white"));
  const factList = facts.map((f) => `<li class="${f.certain ? "certain" : ""}">${dot(f.confidence, f.certain)} ${esc(f.text)}${s.tested[f.locus] ? ` <span class="meta">(vet tested)</span>` : ""}</li>`).join("");
  const plannedWith = s.sex === "ewe"
    ? (state.plans[s.id] ? [state.plans[s.id]!] : [])
    : Object.entries(state.plans).filter(([, r]) => r === s.id).map(([e]) => e);
  const planText = plannedWith.length ? `★ Planned with ${plannedWith.map((id) => esc(state.sheep[id]?.name ?? "?")).join(", ")}` : "";
  const rosettes = s.rosettes.length
    ? `<div class="rosettes">${s.rosettes.map((c) => `<span class="rosette" title="${esc(FAIR_LABEL[c])}">🏵 ${esc(FAIR_LABEL[c])}</span>`).join("")}</div>` : "";
  const traits = traitWords(state, s).map((t) => `<div><dt>${esc(t.label)}</dt><dd>${esc(t.text)}</dd></div>`).join("");
  const buttons: string[] = [];
  if ((own || visitor) && canBreed(s, state.season)) buttons.push(`<button class="primary" data-findmate="${esc(s.id)}">Find a mate</button>`);
  if ((own || visitor) && has(state, "vet")) buttons.push(`<button data-open="vet" data-tab="${esc(s.id)}">Vet test</button>`);
  if (has(state, "tree")) buttons.push(`<button class="secondary" data-open="tree" data-sheep-id="${esc(s.id)}">Family tree</button>`);
  if (own) buttons.push(`<button class="secondary" data-sell="${esc(s.id)}">Sell for ${sheepValue(s, state.season)} coins</button>`);
  if (forSale) buttons.push(`<button data-open="market">See at the market</button>`);
  const status = [
    isIll(s, state.season) ? `<span class="tag warn">poorly — resting this season</span>` : "",
    visitor ? `<span class="tag">visiting ram</span>` : "",
    forSale ? `<span class="tag">for sale</span>` : "",
    !own && !forSale && !visitor ? `<span class="tag">no longer on the farm</span>` : "",
  ].join("");
  const pers = personalityOf(s);
  const flav = flavoursOf(s);
  const colour = String(s.phenotype["colour"]);
  return `<div class="sheep-card">
    <div class="sc-stage" style="--bg:${PORTRAIT_BG[colour] ?? "#dde8f0"}">
      <div class="sc-portrait" data-live-portrait-slot="${esc(s.id)}">${portrait(view, s, "lg")}</div>
      <div class="sc-hello meta" aria-hidden="true">click to say hello</div>
    </div>
    <div class="sc-main">
      <div class="sc-name"><h2>${esc(s.name)} ${sexMark(s)}</h2>${own ? `<button class="icon" data-rename="${esc(s.id)}" title="Rename" aria-label="Rename ${esc(s.name)}">✎</button>` : ""}</div>
      <div class="sc-persona"><span class="persona ${pers}">${PERSONALITY_ICON[pers]} ${esc(PERSONALITY_WORD[pers])}</span>${flav.map((f) => `<span class="sc-flav">${FLAVOUR_ICON[f] ?? ""} ${esc(f)}</span>`).join("")}</div>
      <p class="sc-line">${esc(personalityLine(s))}</p>
      <div class="meta">${esc(s.sex)} · ${esc(ageWords(state, s))}${numbersOn(state) && s.inbreeding > 0 ? ` · inbreeding ${s.inbreeding.toFixed(3)}` : s.inbreeding >= 0.125 ? " · parents were close kin" : ""}</div>
      <div class="tags"><span class="tag">${swatch(colour)}${esc(colour)}</span><span class="tag">${esc(s.phenotype["pattern"])}</span><span class="tag">${esc(s.phenotype["horns"])}</span>${status}</div>
      ${rosettes}
      <dl class="traits">${traits}</dl>
    </div>
    ${own ? careHtml(state, s.id, woolEffect(state, s)) : ""}
    ${buttons.length || planText ? `<div class="row actions">${buttons.join("")}${planText ? `<span class="meta">${planText}</span>` : ""}</div>` : ""}
    <div class="sc-family">
      <div><span class="lbl">Parents</span> ${parents}</div>
      <div><span class="lbl">Lambs</span> ${kids.length ? kids.map((k) => chip(state, k)).join(" ") : `<span class="meta">none yet</span>`}</div>
    </div>
    <div class="notebook">
      <h3>What you know about ${esc(s.name)}</h3>
      <div class="meta legend-dots">${dot(1, true)} certain ${dot(0.9, false)} almost certain ${dot(0.7, false)} probably ${dot(0.3, false)} unknown</div>
      <ul class="facts">${factList || `<li class="meta">Nothing hidden to know yet.</li>`}</ul>
    </div>
  </div>`;
}

// ---- Family tree ------------------------------------------------------------

const NODE_W = 92, NODE_H = 76, GAP_X = 12, ROW_H = 118, KID_W = 86;

interface Placed { n: TreeNode | null; x: number; y: number; kind: "anc" | "self" | "kid" | "mate" }

function nodeHtml(state: GameState, view: View, p: Placed): string {
  const n = p.n;
  const left = Math.round(p.x - (p.kind === "kid" ? KID_W : NODE_W) / 2), top = Math.round(p.y);
  if (!n) return `<span class="tnode empty" style="left:${left}px;top:${top}px">unknown</span>`;
  const s = state.sheep[n.id];
  let img = "";
  if (s) { try { img = view.portraits(s.id) || ""; } catch { img = ""; } }
  const ring = hex(n.colour);
  return `<button class="tnode ${p.kind} ${n.inFlock ? "" : "gone"}" data-sheep="${esc(n.id)}" style="left:${left}px;top:${top}px;--ring:${ring}" title="${esc(`${n.name} — ${n.colour}${n.inFlock ? "" : ", no longer on the farm"}${n.inbreeding >= 0.125 ? ", lamb of close kin" : ""}`)}">
    <span class="t-face">${img ? `<img src="${esc(img)}" alt="">` : `<span class="t-blob"></span>`}</span>
    <span class="t-name">${esc(n.name)} ${n.sex === "ewe" ? "♀" : "♂"}</span>${n.rosettes ? `<span class="ros" title="rosettes">🏵${n.rosettes > 1 ? n.rosettes : ""}</span>` : ""}${n.inbreeding >= 0.125 ? `<span class="inb" title="lamb of close kin">⚠</span>` : ""}</button>`;
}

/**
 * A connected family tree: ancestors fan out above (parents, grandparents, great-grandparents), the sheep in
 * the middle, lambs below grouped by the other parent, with SVG elbow lines and portraits in every node.
 * Grandlambs show as a count on each lamb.
 */
export function familyTreeHtml(state: GameState, view: View, s: Sheep): string {
  const t = familyTree(state, s.id, 3);
  // ancestor generations: gen[0] = parents
  const gens: (AncestorNode | null)[][] = [[t.ancestors.dam, t.ancestors.sire]];
  for (let g = 1; g < 3; g++) gens.push(gens[g - 1]!.flatMap((n) => [n?.dam ?? null, n?.sire ?? null]));
  while (gens.length && gens[gens.length - 1]!.every((n) => !n)) gens.pop();
  // lambs grouped by mate
  const MAX_KIDS = 14;
  const groups = new Map<string, { mate: TreeNode | null; kids: DescendantNode[] }>();
  for (const d of t.descendants) {
    const k = d.mate?.id ?? "?";
    if (!groups.has(k)) groups.set(k, { mate: d.mate, kids: [] });
    groups.get(k)!.kids.push(d);
  }
  let shown = 0;
  const glist = [...groups.values()].map((g) => { const kids = g.kids.slice(0, Math.max(0, MAX_KIDS - shown)); shown += kids.length; return { ...g, kids }; }).filter((g) => g.kids.length);
  const hidden = t.descendants.length - shown;
  const GROUP_GAP = 26;
  const kidsW = glist.reduce((w, g) => w + g.kids.length * (KID_W + GAP_X), 0) + Math.max(0, glist.length - 1) * GROUP_GAP;
  const topSlots = gens.length ? 2 ** gens.length : 1;
  const ancW = gens.length ? topSlots * (NODE_W + GAP_X) : 0;
  const GUTTER = 28; // row labels
  const W = Math.max(ancW, kidsW, NODE_W + 40) + 40 + GUTTER;
  const cx = GUTTER + (W - GUTTER) / 2;
  const rowLabels: string[] = [];
  const GEN_LABEL = ["Parents", "Grandparents", "Great-grandparents"];
  const nodes: Placed[] = [];
  const lines: string[] = [];
  const H0 = gens.length ? 14 : 34;
  const selfY = H0 + gens.length * ROW_H;
  // ancestors: row r (0 = oldest shown generation) at the top
  const pos = new Map<string, { x: number; y: number }>();
  gens.forEach((row, g) => {
    const y = selfY - (g + 1) * ROW_H;
    rowLabels.push(`<span class="t-row" style="top:${Math.round(y)}px">${GEN_LABEL[g]}</span>`);
    const slotW = ancW / row.length;
    row.forEach((n, j) => {
      const x = cx - ancW / 2 + slotW * (j + 0.5);
      pos.set(`${g}:${j}`, { x, y });
      if (n || g === 0) nodes.push({ n, x, y, kind: "anc" });
    });
  });
  // lines from each child up to its two parents
  const elbow = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
    const my = (y1 + y2) / 2;
    lines.push(`<path class="${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} V${my.toFixed(1)} H${x2.toFixed(1)} V${y2.toFixed(1)}"/>`);
  };
  gens.forEach((row, g) => {
    row.forEach((n, j) => {
      if (!n && g > 0) return;
      const child = g === 0 ? { x: cx, y: selfY } : pos.get(`${g - 1}:${Math.floor(j / 2)}`)!;
      const me = pos.get(`${g}:${j}`)!;
      elbow(child.x, child.y, me.x, me.y + NODE_H, `${j % 2 === 0 ? "dam" : "sire"} ${n ? "" : "faint"}`);
    });
  });
  nodes.push({ n: t.self, x: cx, y: selfY, kind: "self" });
  // lambs
  const kidY = selfY + ROW_H + 18;
  if (glist.length) rowLabels.push(`<span class="t-row" style="top:${Math.round(kidY)}px">Lambs</span>`);
  let x = cx - kidsW / 2;
  for (const g of glist) {
    const gx0 = x + KID_W / 2;
    for (const k of g.kids) {
      const kx = x + KID_W / 2;
      nodes.push({ n: k, x: kx, y: kidY, kind: "kid" });
      elbow(cx, selfY + NODE_H, kx, kidY, "kid");
      x += KID_W + GAP_X;
    }
    const gx1 = x - GAP_X - KID_W / 2;
    const gname = g.mate ? `with ${g.mate.name}` : "other parent unknown";
    lines.push(`<text class="mate-lbl" x="${((gx0 + gx1) / 2).toFixed(1)}" y="${(kidY - 8).toFixed(1)}" text-anchor="middle">${esc(gname)}</text>`);
    x += GROUP_GAP;
  }
  const H = (glist.length ? kidY + NODE_H + 30 : selfY + NODE_H + 16);
  if (!glist.length) rowLabels.push(`<span class="t-row nolambs" style="top:${Math.round(selfY)}px">No lambs yet</span>`);
  const grand = (d: DescendantNode) => { let n = 0; const walk = (xs: DescendantNode[]) => { for (const c of xs) { n++; walk(c.children); } }; walk(d.children); return n; };
  const nodeMarkup = nodes.map((p) => {
    let h = nodeHtml(state, view, p);
    if (p.kind === "kid" && p.n) {
      const g = grand(p.n as DescendantNode);
      if (g) h = h.replace("</button>", `<span class="t-grand" title="grandlambs">+${g} lamb${g === 1 ? "" : "s"}</span></button>`);
    }
    return h;
  }).join("");
  return `<div class="ftree-scroll"><div class="ftree" style="width:${Math.round(W)}px;height:${Math.round(H)}px">
    <svg class="ftree-lines" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${Math.round(W)} ${Math.round(H)}" aria-hidden="true">${lines.join("")}</svg>
    ${gens.length ? "" : `<div class="t-note meta" style="left:${Math.round(cx - 120)}px;top:8px">${esc(s.name)} came with no pedigree.</div>`}
    ${rowLabels.join("")}
    ${nodeMarkup}
  </div></div>${hidden > 0 ? `<p class="meta">…and ${hidden} more lamb${hidden === 1 ? "" : "s"}. Open one of them to see their own family.</p>` : ""}`;
}

export function treeHtml(state: GameState, view: View): string {
  const s = cardSubject(state, view);
  if (!s) return `<h2>Family tree</h2><p>No sheep yet.</p>`;
  if (!has(state, "tree")) return `<h2>Family tree</h2><p>The family book is still in the attic. It turns up later in the story.</p>`;
  return `<h2>${esc(s.name)}'s family</h2>
    <div class="meta tree-key"><span class="k-dam"></span> mother's side &nbsp;<span class="k-sire"></span> father's side · the ring shows wool colour · faded cards have left the farm · ⚠ lamb of close kin · click anyone to open their card</div>
    ${familyTreeHtml(state, view, s)}
    <div class="row"><button class="secondary" data-sheep="${esc(s.id)}">Back to ${esc(s.name)}</button></div>`;
}

export function isAdultFlock(state: GameState): Sheep[] {
  return state.flock.map((id) => state.sheep[id]!).filter((x) => isAdult(x, state.season));
}

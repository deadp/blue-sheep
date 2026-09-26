/** Sheep card and family tree. */
import {
  FAIR_LABEL, canBreed, factsFor, familyTree, isAdult, isIll, sheepValue,
  type AncestorNode, type DescendantNode, type GameState, type Sheep, type TreeNode,
} from "../core/index.js";
import { ageWords, chip, dot, esc, has, hex, numbersOn, portrait, sexMark, swatch, traitWords } from "./util.js";
import type { View } from "./view.js";

export function cardSubject(state: GameState, view: View): Sheep | null {
  const s = view.sheepId ? state.sheep[view.sheepId] : undefined;
  return s ?? (state.flock[0] ? state.sheep[state.flock[0]]! : null);
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
  return `<div class="sheep-card">
    <div class="sc-portrait">${portrait(view, s, "lg")}</div>
    <div class="sc-main">
      <div class="sc-name"><h2>${esc(s.name)} ${sexMark(s)}</h2>${own ? `<button class="icon" data-rename="${esc(s.id)}" title="Rename" aria-label="Rename ${esc(s.name)}">✎</button>` : ""}</div>
      <div class="meta">${esc(s.sex)} · ${esc(ageWords(state, s))}${numbersOn(state) && s.inbreeding > 0 ? ` · inbreeding ${s.inbreeding.toFixed(3)}` : s.inbreeding >= 0.125 ? " · parents were close kin" : ""}</div>
      <div class="tags"><span class="tag">${swatch(String(s.phenotype["colour"]))}${esc(s.phenotype["colour"])}</span><span class="tag">${esc(s.phenotype["pattern"])}</span><span class="tag">${esc(s.phenotype["horns"])}</span>${status}</div>
      ${rosettes}
      <dl class="traits">${traits}</dl>
    </div>
    <div class="sc-family">
      <div><span class="lbl">Parents</span> ${parents}</div>
      <div><span class="lbl">Lambs</span> ${kids.length ? kids.map((k) => chip(state, k)).join(" ") : `<span class="meta">none yet</span>`}</div>
    </div>
    <div class="notebook">
      <h3>What you know about ${esc(s.name)}</h3>
      <div class="meta legend-dots">${dot(1, true)} certain ${dot(0.9, false)} almost certain ${dot(0.7, false)} probably ${dot(0.3, false)} unknown</div>
      <ul class="facts">${factList || `<li class="meta">Nothing hidden to know yet.</li>`}</ul>
    </div>
    ${buttons.length || planText ? `<div class="row actions">${buttons.join("")}${planText ? `<span class="meta">${planText}</span>` : ""}</div>` : ""}
  </div>`;
}

// ---- Family tree ------------------------------------------------------------

function nodeChip(state: GameState, n: TreeNode | null, self = false): string {
  if (!n) return `<span class="tchip empty">unknown</span>`;
  return `<button class="tchip ${n.inFlock ? "" : "gone"} ${self ? "self" : ""}" data-sheep="${esc(n.id)}" title="${n.inFlock ? "in your flock" : "no longer on the farm"}">
    <span class="swatch" style="--wool:${hex(n.colour)}"></span><span>${esc(n.name)} ${n.sex === "ewe" ? "♀" : "♂"}</span>${n.rosettes ? `<span class="ros">🏵${n.rosettes > 1 ? n.rosettes : ""}</span>` : ""}${n.inbreeding >= 0.125 ? `<span class="inb" title="inbred">⚠</span>` : ""}</button>`;
}

function ancestorsCols(state: GameState, a: { dam: AncestorNode | null; sire: AncestorNode | null }): string {
  // Columns from the oldest generation (left) to parents (right).
  const gen: (AncestorNode | null)[][] = [[a.dam, a.sire]];
  for (let g = 1; g < 3; g++) gen.push(gen[g - 1]!.flatMap((n) => [n?.dam ?? null, n?.sire ?? null]));
  if (gen[2]!.every((n) => !n)) gen.pop();
  if (gen[1] && gen[1].every((n) => !n)) gen.pop();
  const label = ["Parents", "Grandparents", "Great-grandparents"];
  return gen.map((col, i) => `<div class="tcol"><div class="tlabel">${label[i]}</div><div class="tcol-chips">${col.map((n) => nodeChip(state, n)).join("")}</div></div>`).reverse().join("");
}

function descendantsList(state: GameState, ds: DescendantNode[], depth = 0): string {
  if (!ds.length) return depth === 0 ? `<p class="meta">No lambs yet.</p>` : "";
  if (depth >= 1) {
    // Grandchildren and below: a wrapped row of chips, so big families stay compact.
    const flat: DescendantNode[] = [];
    const walk = (xs: DescendantNode[]) => { for (const x of xs) { flat.push(x); walk(x.children); } };
    walk(ds);
    return `<div class="tgrand">${flat.map((d) => nodeChip(state, d)).join("")}</div>`;
  }
  return `<ul class="tdesc">${ds.map((d) => `<li><div class="tkid">${nodeChip(state, d)}${d.mate ? `<span class="meta"> with ${esc(d.mate.name)}</span>` : ""}</div>${descendantsList(state, d.children, depth + 1)}</li>`).join("")}</ul>`;
}

export function treeHtml(state: GameState, view: View): string {
  const s = cardSubject(state, view);
  if (!s) return `<h2>Family tree</h2><p>No sheep yet.</p>`;
  if (!has(state, "tree")) return `<h2>Family tree</h2><p>The family book is still in the attic. It turns up later in the story.</p>`;
  const t = familyTree(state, s.id, 3);
  const noAnc = !t.ancestors.dam && !t.ancestors.sire;
  return `<h2>${esc(s.name)}'s family</h2>
    <div class="meta">Faded names have left the farm. ⚠ marks lambs of close kin. Click a name to open its card.</div>
    <h3>Ancestors</h3>
    ${noAnc ? `<p class="meta">${esc(s.name)} came with no pedigree.</p>` : `<div class="tree-up">${ancestorsCols(state, t.ancestors)}<div class="tcol"><div class="tlabel">&nbsp;</div><div class="tcol-chips">${nodeChip(state, t.self, true)}</div></div></div>`}
    <h3>Descendants</h3>
    <div class="tree-down">${nodeChip(state, t.self, true)}${descendantsList(state, t.descendants)}</div>
    <div class="row"><button class="secondary" data-sheep="${esc(s.id)}">Back to ${esc(s.name)}</button></div>`;
}

export function isAdultFlock(state: GameState): Sheep[] {
  return state.flock.map((id) => state.sheep[id]!).filter((x) => isAdult(x, state.season));
}

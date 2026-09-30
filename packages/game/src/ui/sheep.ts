/** Sheep card and family tree. */
import {
  FAIR_LABEL, PERSONALITY_WORD, TREAT_COST, ageOf, fondnessWord, type Personality, brushedThisSeason, forecastBrush, isPetId, canBreed, factsFor, familyTree, flavoursOf, fleeceAt, fondWoolMultiplier, fondnessOf,
  forecastTreat, greetedThisSeason, isAdult, isIll, personalityLine, personalityOf, sheepValue, treatBlocked, treatedThisSeason, woolOf,
  type AncestorNode, type DescendantNode, type GameState, type Sheep, type TreeNode,
} from "../core/index.js";
import { ageWords, chip, dot, esc, has, heartMeter, numbersOn, pigmentDots, portrait, sexMark, swatch, traitWords, LOCUS_FRIENDLY } from "./util.js";
import { btn, fact, head, icon, more, nm, tag, type IconName } from "./felt/index.js";
import type { View } from "./view.js";

/** Pastel backdrop per colour family for the live portrait (a soft complement, so the wool stands out). */
const PORTRAIT_BG: Record<string, string> = {
  white: "#cfe3ee", oatmeal: "#d9e3f3", taupe: "#dcecd0", charcoal: "#f5e2cf", brown: "#dcecd0",
  red: "#d6ebe0", orange: "#d7e4f3", yellow: "#dcd9f0", green: "#f3dfe3", blue: "#f7e7cc", purple: "#e7f0d0",
};
const FLAVOUR_ICON: Record<string, IconName> = { fluffy: "cloud", stocky: "stone", dainty: "flower", curly: "curl", silky: "sparkle" };
/** An embroidered icon per personality (the core's emoji stay in core). */
export const PERSONA_ICON: Record<Personality, IconName> = { shy: "flower", calm: "leaf", curious: "eye", bold: "sun" };

export function cardSubject(state: GameState, view: View): Sheep | null {
  const s = view.sheepId ? state.sheep[view.sheepId] : undefined;
  return s ?? (state.flock[0] ? state.sheep[state.flock[0]]! : null);
}

/**
 * The care row: how fond the animal is of you (hearts, with the treat's gain drawn faintly: its forecast),
 * whether you've said hello this season, the brushing (press and hold the picture) and the treat button.
 * `effect` and the full treat forecast go behind "more" (`careMore`).
 */
export function careHtml(state: GameState, id: string, _effect = ""): string {
  const level = fondnessOf(state, id);
  const treated = treatedThisSeason(state, id);
  const fc = treated ? null : forecastTreat(state, id);
  const pet = isPetId(id);
  const brushed = brushedThisSeason(state, id);
  const said = greetedThisSeason(state, id) ? `<span class="c-said">${icon("heart", "sm")}said hello this season</span>` : "";
  const brush = brushed
    ? `<span class="c-brush done" data-brushed="1">${icon(pet ? "hand" : "brush", "sm")}${pet ? "Patted" : "Brushed"} this season ${icon("check", "sm")}</span>`
    : `<span class="c-brush" data-brushed="0">${icon(pet ? "hand" : "brush", "sm")}Press and hold the picture to ${pet ? "pat" : "brush"}</span>`;
  const gain = fc && fc.after > level && fondnessWord(fc.after) !== fondnessWord(level) ? ` <span class="c-gain" title="A treat would make ${esc(fondnessWord(fc.after).toLowerCase())}">${icon("apple", "sm")}→ ${esc(fondnessWord(fc.after))}</span>` : "";
  return `<div class="care" data-care="${esc(id)}">
    <div class="c-top">${heartMeter(state, level, fc && fc.after > level ? { to: fc.after } : {})}${gain}</div>
    <div class="c-notes">${brush}${said}</div>
  </div>`;
}

/** The treat button (or "Treat given ✓"). */
export function treatButton(state: GameState, id: string): string {
  if (treatedThisSeason(state, id)) return tag(`Treat given ${icon("check", "sm")}`, { icon: "apple", tone: "rose", cls: "ok" });
  const blocked = treatBlocked(state, id);
  const fc = forecastTreat(state, id);
  return btn(`Give a treat · ${TREAT_COST}`, { kind: "secondary", icon: "apple", cls: "treat", data: { treat: id }, disabled: !!blocked, title: blocked && state.money < TREAT_COST ? "Not enough coins" : fc.text });
}

/** The words behind "more" for the care row: the treat's forecast, the brushing's, and what fondness does. */
function careMore(state: GameState, id: string, effect: string): string {
  const treated = treatedThisSeason(state, id);
  const fb = brushedThisSeason(state, id) ? null : forecastBrush(state, id);
  const fc = treated ? null : forecastTreat(state, id);
  return `<ul class="plain small care-more">
    ${effect ? `<li>${effect}</li>` : ""}
    <li>${icon("apple", "inl")} ${treated ? "Had a treat this season. Say hello again next season." : esc(fc!.text)}</li>
    ${fb ? `<li>${icon("brush", "inl")} ${esc(fb.text)}</li>` : ""}
  </ul>`;
}

/** What this sheep's fondness does for its wool, in a short sentence (coins; % only with numbers). */
function woolEffect(state: GameState, s: Sheep): string {
  const her = s.sex === "ram" ? "His" : "Her";
  if (!isAdult(s, state.season)) return "Too young to shear. Lambs raised with kindness grow into happy sheep.";
  const level = fondnessOf(state, s.id);
  const m = fondWoolMultiplier(level);
  const d = fleeceAt(state, s, level) - fleeceAt(state, s, 30);
  const pct = numbersOn(state) && Math.abs(m - 1) > 0.001 ? ` (${m > 1 ? "+" : "−"}${Math.round(Math.abs(m - 1) * 100)}%)` : "";
  if (m > 1.001) return d > 0 ? `${icon("heart", "inl")} Happy sheep grow better wool: ${her.toLowerCase()} fleece fetches about <b>+${d} coin${d === 1 ? "" : "s"}</b> a shearing${pct}.` : `${icon("heart", "inl")} A happy sheep: ${her.toLowerCase()} wool is getting better${pct}.`;
  if (m < 0.999) return `${icon("heartBroken", "inl")} Skittish sheep grow poorer wool: ${her.toLowerCase()} fleece fetches ${d < 0 ? `about <b>−${-d} coin${d === -1 ? "" : "s"}</b>` : "a little less"} a shearing${pct}. Say hello!`;
  return `${icon("yarn", "inl")} ${her} wool fetches the usual price. Once ${s.sex === "ram" ? "he" : "she"} is fond of you, it fetches more.`;
}

/** "3" + "seasons", or "2" + "years": the age fact tile. */
function ageFact(state: GameState, s: Sheep): [string, string] {
  const a = ageOf(s, state.season);
  if (a <= 0) return ["new", "born"];
  if (a < 8) return [String(a), `season${a === 1 ? "" : "s"}`];
  const y = Math.floor(a / 4);
  return [String(y), "years"];
}

/** One-word names for the compact "what you know" line on the card. */
const KNOW_SHORT: Record<string, string> = { W: "colour", Dl: "pale", S: "spots", P: "horns" };
/** The pigment genes on the compact line: a paint dot instead of a word, so the line fits. */
const KNOW_PAINT = new Set(["red", "yellow", "blue"]);

export function sheepCardHtml(state: GameState, view: View): string {
  const s = cardSubject(state, view);
  if (!s) return `${head("sheep", "No sheep", 2)}<p>Your fields are empty. The market has sheep for sale.</p>`;
  const own = state.flock.includes(s.id);
  const forSale = state.market.includes(s.id);
  const visitor = state.visitingRam?.id === s.id;
  const dam = s.dam ? state.sheep[s.dam] : undefined, sire = s.sire ? state.sheep[s.sire] : undefined;
  const parents = dam || sire
    ? `${dam ? chip(state, dam) : "unknown"} × ${sire ? chip(state, sire) : "unknown"}`
    : `<span class="meta">${s.origin === "founder" ? "one of the old farm's flock — no records" : s.origin === "visitor" ? "from over the hills — no records" : "bought in — no pedigree"}</span>`;
  const kids = Object.values(state.sheep).filter((k) => k.dam === s.id || k.sire === s.id);
  // A coloured sheep's own look settles its hidden colour; its doses show as dots, so only the "how it passes
  // on" facts (and pale, spots, horns) are worth a line.
  const coloured = s.phenotype["white"] !== "white";
  const facts = factsFor(state, s.id).filter((f) => !(f.locus === "W" && coloured));
  const factList = facts.map((f) => `<li class="${f.certain ? "certain" : ""}">${dot(f.confidence, f.certain)} <span>${esc(f.text)}${s.tested[f.locus] ? ` ${icon("vet", "inl")}` : ""}</span></li>`).join("");
  const plannedWith = s.sex === "ewe"
    ? (state.plans[s.id] ? [state.plans[s.id]!] : [])
    : Object.entries(state.plans).filter(([, r]) => r === s.id).map(([e]) => e);
  const planTag = plannedWith.length ? tag(`with ${plannedWith.map((id) => esc(state.sheep[id]?.name ?? "?")).join(", ")}`, { icon: "rings", tone: "sage", title: "Mating planned" }) : "";
  const rosettes = s.rosettes.map((c) => tag(esc(FAIR_LABEL[c]), { icon: "rosette", tone: "butter", cls: "rosette" })).join("");
  const traits = traitWords(state, s).map((t) => `<div><dt>${esc(t.label)}</dt><dd>${esc(t.text)}</dd></div>`).join("");
  // Two felt buttons at most; the rest are small stitched icon buttons.
  const primary: string[] = [];
  if ((own || visitor) && canBreed(s, state.season)) primary.push(btn("Find a mate", { kind: "primary", icon: "rings", data: { findmate: s.id } }));
  if (own) primary.push(treatButton(state, s.id));
  if (forSale) primary.push(btn("See at the market", { icon: "store", data: { open: "market" } }));
  const small: string[] = [];
  if ((own || visitor) && has(state, "vet")) small.push(btn("Vet", { kind: "ghost", cls: "small", icon: "vet", data: { open: "vet", tab: s.id }, title: "Vet test" }));
  if (has(state, "tree")) small.push(btn("Family", { kind: "ghost", cls: "small", icon: "family", data: { open: "tree", "sheep-id": s.id }, title: "Family tree" }));
  if (own) small.push(btn(`Sell · ${sheepValue(s, state.season)}`, { kind: "ghost", cls: "small", icon: "tag", data: { sell: s.id }, title: `Sell for ${sheepValue(s, state.season)} coins` }));
  const status = [
    isIll(s, state.season) ? tag("poorly — resting", { icon: "warn", tone: "rose", cls: "warn" }) : "",
    visitor ? tag("visiting ram", { icon: "ram", tone: "sky" }) : "",
    forSale ? tag("for sale", { icon: "tag", tone: "butter" }) : "",
    !own && !forSale && !visitor ? tag("no longer on the farm", { tone: "cream" }) : "",
  ].join("");
  const pers = personalityOf(s);
  const flav = flavoursOf(s);
  const w = woolOf(s);
  const colour = w.word;
  const pattern = String(s.phenotype["pattern"] ?? "solid"), horns = String(s.phenotype["horns"]);
  const young = !isAdult(s, state.season);
  const wool = traitWords(state, s)[0]!.text.replace(/ \(.*\)$/, "");
  const [ageN, ageW] = ageFact(state, s);
  const looks = [pattern === "spotted" ? "spotted" : "", horns === "horned" ? "horned" : ""].filter(Boolean).join(", ");
  const details = `
    <dl class="traits">${traits}</dl>
    ${own ? careMore(state, s.id, woolEffect(state, s)) : ""}
    <div class="sc-family">
      <div><span class="lbl">Parents</span> ${parents}</div>
      <div><span class="lbl">Lambs</span> ${kids.length ? kids.map((k) => chip(state, k)).join(" ") : `<span class="meta">none yet</span>`}</div>
    </div>
    <div class="notebook">
      <h4>What you know</h4>
      <div class="meta legend-dots">${dot(1, true)} certain ${dot(0.9, false)} almost ${dot(0.7, false)} probably ${dot(0.3, false)} unknown</div>
      <ul class="facts">${factList || `<li class="meta">Nothing hidden to know yet.</li>`}</ul>
    </div>
    <div class="meta">${esc(s.sex)} · ${esc(ageWords(state, s))}${numbersOn(state) && s.inbreeding > 0 ? ` · inbreeding ${s.inbreeding.toFixed(3)}` : s.inbreeding >= 0.125 ? " · parents were close kin" : ""}</div>`;
  return `<div class="sheep-card">
    <div class="sc-stage" style="--bg:${PORTRAIT_BG[w.family] ?? "#dde8f0"}">
      <div class="sc-portrait" data-live-portrait-slot="${esc(s.id)}">${portrait(view, s, "lg")}</div>
      <div class="sc-hello" aria-hidden="true">click to say hello</div>
    </div>
    <div class="sc-name"><h2 class="nm">${esc(s.name)}</h2>${sexMark(s)}${own ? `<button class="icon ghost tiny" data-rename="${esc(s.id)}" title="Rename" aria-label="Rename ${esc(s.name)}">${icon("pencil")}</button>` : ""}</div>
    <div class="sc-persona"><span class="persona ${pers}">${icon(PERSONA_ICON[pers])}${esc(PERSONALITY_WORD[pers].toLowerCase())} ${esc(s.sex)}</span>${flav.slice(0, 1).map((f) => `<span class="sc-flav">${icon(FLAVOUR_ICON[f] ?? "sparkle")}${esc(f)}</span>`).join("")}</div>
    ${status || planTag || rosettes ? `<div class="tags">${status}${planTag}${rosettes}</div>` : ""}
    ${own ? careHtml(state, s.id) : ""}
    <p class="sc-line">“${esc(personalityLine(s))}”</p>
    <div class="facts-row">
      ${fact(swatch(w.hex, "big"), esc(colour), esc(looks || (w.trueBlue ? "true blue!" : w.family === "white" ? "colour hidden" : "colour")), { tone: "cream", title: `${colour}${w.trueBlue ? " (true blue)" : ""}, ${pattern}, ${horns}` })}
      ${fact(icon(young ? "sprout" : "yarn"), esc(young ? "lamb" : wool.split(" ").slice(-1)[0] ?? wool), young ? "not shorn yet" : "wool", { tone: "sage", title: `Wool: ${wool}` })}
      ${fact(icon("cake"), esc(ageN), esc(ageW), { tone: "rose", title: ageWords(state, s) })}
    </div>
    ${coloured ? `<div class="sc-colour" data-colour="${esc(w.family)}" data-hex="${esc(w.hex)}">${pigmentDots(s)}</div>` : ""}
    ${facts.length ? `<div class="sc-know" data-know title="What you know about the hidden genes (open “more” for the words)">${icon("lens", "inl")}${facts.map((f) => `<span class="k-item" title="${esc(`${f.label}: ${f.text}`)}">${dot(f.confidence, f.certain)}${KNOW_PAINT.has(f.locus) ? `<span class="v-pig ${f.locus}" aria-label="${esc(f.label)}"></span>` : `<span>${esc(KNOW_SHORT[f.locus] ?? LOCUS_FRIENDLY[f.locus] ?? f.label)}</span>`}</span>`).join("")}</div>` : ""}
    ${primary.length ? `<div class="card-acts">${primary.slice(0, 2).join("")}</div>` : ""}
    ${small.length ? `<div class="card-tools">${small.join("")}</div>` : ""}
    ${more("sheep-more", "What you know, family, wool", details)}
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
  const ring = n.wool;
  return `<button class="tnode ${p.kind} ${n.inFlock ? "" : "gone"}" data-sheep="${esc(n.id)}" style="left:${left}px;top:${top}px;--ring:${ring}" title="${esc(`${n.name} — ${n.colour}${n.inFlock ? "" : ", no longer on the farm"}${n.inbreeding >= 0.125 ? ", lamb of close kin" : ""}`)}">
    <span class="t-face">${img ? `<img src="${esc(img)}" alt="">` : `<span class="t-blob"></span>`}</span>
    <span class="t-name"><span class="nm">${esc(n.name)}</span> ${n.sex === "ewe" ? "♀" : "♂"}</span>${n.rosettes ? `<span class="ros" title="rosettes">${icon("rosette", "inl")}${n.rosettes > 1 ? n.rosettes : ""}</span>` : ""}${n.inbreeding >= 0.125 ? `<span class="inb" title="lamb of close kin">${icon("warn", "inl")}</span>` : ""}</button>`;
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
  if (!s) return `${head("family", "Family tree", 2)}<p>No sheep yet.</p>`;
  if (!has(state, "tree")) return `${head("family", "Family tree", 2)}<p>The family book is still in the attic. It turns up later in the story.</p>`;
  return `<div class="panel-head">${head("family", `${nm(esc(s.name))}'s family`, 2)}${btn(`Back to ${esc(s.name)}`, { kind: "ghost", icon: "back", data: { sheep: s.id } })}</div>
    <div class="meta tree-key"><span><span class="k-dam"></span> mother's side</span><span><span class="k-sire"></span> father's side</span><span>${icon("warn", "inl")} close kin</span><span class="faded">faded: left the farm</span></div>
    ${familyTreeHtml(state, view, s)}`;
}

export function isAdultFlock(state: GameState): Sheep[] {
  return state.flock.map((id) => state.sheep[id]!).filter((x) => isAdult(x, state.season));
}

/** Mate picker + forecast panel HTML. Pure functions of state; clicks are handled by the scene via data attributes. */
import { sheep as sheepDefs } from "@blue-sheep/genetics";
import { forecastQuantitative, informationGain, lambOutcomes, type Record_ } from "@blue-sheep/inference";
import { posteriors } from "../knowledge.js";
import { RAM_CAPACITY, plannedPairings } from "../sim.js";
import { isAdult, pedigreeOf, type GameState, type Sheep } from "../state.js";
import { esc } from "./overlay.js";

export type Goal = "blue" | "learn" | "fine" | "heavy";
export const GOALS: { id: Goal; label: string }[] = [
  { id: "blue", label: "Blue lamb" }, { id: "learn", label: "Learn the most" }, { id: "fine", label: "Finer wool" }, { id: "heavy", label: "Heavier fleece" },
];

export interface CrossForecast {
  colour: Record<string, number>;
  horns: Record<string, number>;
  pattern: Record<string, number>;
  learnBits: number;
  fineness: ReturnType<typeof forecastQuantitative>;
  fleeceWeight: ReturnType<typeof forecastQuantitative>;
  relatedness: number;
  inbreeding: number;
}

function records(state: GameState, traitId: string): Record_[] {
  return Object.values(state.sheep).filter((s) => isAdult(s, state.season) || !state.flock.includes(s.id)).map((s) => ({ id: s.id, dam: s.dam, sire: s.sire, value: Number(s.phenotype[traitId]) }));
}

function flockStats(state: GameState, traitId: string): { mean: number; sd: number } {
  const vals = Object.values(state.sheep).map((s) => Number(s.phenotype[traitId]));
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1)) || 1;
  return { mean, sd };
}

export function forecastCross(state: GameState, eweId: string, ramId: string): CrossForecast {
  const post = posteriors(state);
  const colourP = post.byTrait.get("colour")!, hornsP = post.byTrait.get("horns")!, patP = post.byTrait.get("pattern")!;
  const ped = pedigreeOf(state);
  const ewe = state.sheep[eweId]!, ram = state.sheep[ramId]!;
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  return {
    colour: lambOutcomes(colourP, eweId, ramId),
    horns: lambOutcomes(hornsP, eweId, ramId),
    pattern: lambOutcomes(patP, eweId, ramId),
    learnBits: informationGain(colourP, eweId, ramId) + informationGain(hornsP, eweId, ramId) + informationGain(patP, eweId, ramId),
    fineness: forecastQuantitative(sheepDefs.fineness, Number(ewe.phenotype["fineness"]), Number(ram.phenotype["fineness"]), records(state, "fineness"), fin.mean, fin.sd),
    fleeceWeight: forecastQuantitative(sheepDefs.fleeceWeight, Number(ewe.phenotype["fleeceWeight"]), Number(ram.phenotype["fleeceWeight"]), records(state, "fleeceWeight"), fw.mean, fw.sd),
    relatedness: ped.relatedness(eweId, ramId),
    inbreeding: ped.offspringInbreeding(eweId, ramId),
  };
}

function score(f: CrossForecast, goal: Goal): number {
  switch (goal) {
    case "blue": return f.colour["blue"] ?? 0;
    case "learn": return f.learnBits;
    case "fine": return -f.fineness.mean;
    case "heavy": return f.fleeceWeight.mean;
  }
}

export function candidates(state: GameState, forId: string): Sheep[] {
  const me = state.sheep[forId]!;
  return state.flock.map((id) => state.sheep[id]!).filter((s) => s.id !== forId && s.sex !== me.sex && isAdult(s, state.season));
}

const COLOUR_HEX: Record<string, string> = { white: "#f3eee2", black: "#3c3436", brown: "#8a5a36", blue: "#8fa8d8", fawn: "#d9b98c" };

/** Ten lamb icons coloured by probability (largest-remainder rounding). */
function litterRow(colour: Record<string, number>, horns: Record<string, number>, showNumbers: boolean): string {
  const entries = Object.entries(colour).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]);
  const counts = entries.map(([c, p]) => ({ c, p, n: Math.floor(p * 10), frac: p * 10 - Math.floor(p * 10) }));
  let left = 10 - counts.reduce((a, b) => a + b.n, 0);
  for (const e of [...counts].sort((a, b) => b.frac - a.frac)) { if (left <= 0) break; e.n++; left--; }
  const hornedP = horns["horned"] ?? 0;
  let icons = "";
  let k = 0;
  for (const e of counts) for (let i = 0; i < e.n; i++, k++) {
    const horned = k < Math.round(hornedP * 10);
    icons += `<span class="lamb" title="${e.c}${horned ? ", horned" : ""}" style="--wool:${COLOUR_HEX[e.c] ?? "#ccc"}">${horned ? "<i></i>" : ""}</span>`;
  }
  const rare = entries.filter(([, p]) => p > 0 && p < 0.05).map(([c]) => c);
  const legend = entries.map(([c, p]) => `<span class="key"><b style="background:${COLOUR_HEX[c]}"></b>${c}${showNumbers ? ` ${Math.round(p * 100)}%` : ""}</span>`).join("");
  return `<div class="litter">${icons}</div><div class="legend">${legend}${rare.length ? `<span class="meta">(a ${rare.join("/")} lamb is possible but rare)</span>` : ""}</div>`;
}

function rangeBar(label: string, unit: string, f: ReturnType<typeof forecastQuantitative>, lo: number, hi: number, ewe: number, ram: number, flock: number, showNumbers: boolean, lowerIsBetter: boolean): string {
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const bandL = pct(f.mean - f.sd), bandR = pct(f.mean + f.sd);
  const vague = f.h2.pairs < 4;
  return `<div class="range"><div class="rlabel">${label} ${lowerIsBetter ? "<span class=meta>(lower is finer)</span>" : ""}</div>
    <div class="track"><div class="band" style="left:${bandL};width:calc(${bandR} - ${bandL})"></div>
      <div class="tick flock" style="left:${pct(flock)}" title="flock average"></div>
      <div class="tick ewe" style="left:${pct(ewe)}" title="ewe"></div><div class="tick ram" style="left:${pct(ram)}" title="ram"></div>
      <div class="tick mean" style="left:${pct(f.mean)}" title="expected lamb"></div></div>
    <div class="meta">${showNumbers ? `expected ${f.mean.toFixed(1)} ${unit} ± ${f.sd.toFixed(1)} · heritability estimate ${f.h2.h2.toFixed(2)} from ${f.h2.pairs} families` : vague ? "Only a rough guess — more lambs on record will sharpen this." : `Based on ${f.h2.pairs} families on your farm.`}</div></div>`;
}

function relationText(r: number, F: number): string {
  if (r === 0) return "Unrelated";
  const label = r >= 0.5 ? "Parent and child or full siblings" : r >= 0.25 ? "Half siblings or grandparent" : r >= 0.125 ? "Cousins" : "Distant relatives";
  const risk = F >= 0.25 ? " ⚠ lambs would be strongly inbred" : F >= 0.125 ? " ⚠ lambs would be inbred" : "";
  return `${label}${risk}`;
}

export function forecastPanelHtml(state: GameState, forId: string, mateId: string | null, goal: Goal): string {
  const me = state.sheep[forId]!;
  const showNumbers = state.unlocks.includes("numbers");
  const cands = candidates(state, forId);
  const scored = cands.map((c) => {
    const [eweId, ramId] = me.sex === "ewe" ? [me.id, c.id] : [c.id, me.id];
    const f = forecastCross(state, eweId, ramId);
    return { c, f, s: score(f, goal) };
  }).sort((a, b) => b.s - a.s);
  const chosen = scored.find((x) => x.c.id === mateId) ?? scored[0];
  const load = new Map<string, number>();
  for (const p of plannedPairings(state)) load.set(p.ram, (load.get(p.ram) ?? 0) + 1);
  const goalTabs = GOALS.map((g) => `<button class="tab ${g.id === goal ? "on" : ""}" data-goal="${g.id}">${g.label}</button>`).join("");
  const list = scored.map(({ c, f, s }) => {
    const [eweId, ramId] = me.sex === "ewe" ? [me.id, c.id] : [c.id, me.id];
    const planned = state.plans[eweId] === ramId;
    const full = c.sex === "ram" && (load.get(c.id) ?? 0) >= RAM_CAPACITY && !planned;
    const hint = goal === "blue" ? `${showNumbers ? `${Math.round((f.colour["blue"] ?? 0) * 100)}%` : (f.colour["blue"] ?? 0) > 0.2 ? "good odds" : (f.colour["blue"] ?? 0) > 0 ? "possible" : "no"}`
      : goal === "learn" ? "🔍".repeat(Math.min(3, Math.ceil(s * 2))) || "—"
      : goal === "fine" ? `${showNumbers ? f.fineness.mean.toFixed(1) + " µm" : ""}` : `${showNumbers ? f.fleeceWeight.mean.toFixed(1) + " kg" : ""}`;
    return `<button class="cand ${c.id === chosen?.c.id ? "on" : ""} ${full ? "full" : ""}" data-mate="${c.id}" ${full ? "disabled" : ""}>
      <span class="swatch" style="background:${COLOUR_HEX[String(c.phenotype["colour"])]}"></span><span>${esc(c.name)}${planned ? " ★" : ""}</span><span class="meta">${hint}${full ? " (busy)" : ""}</span></button>`;
  }).join("");
  if (!chosen) return `<h2>Find a mate for ${esc(me.name)}</h2><p>No adult ${me.sex === "ewe" ? "rams" : "ewes"} on the farm. Visit the trader.</p>`;
  const [eweId, ramId] = me.sex === "ewe" ? [me.id, chosen.c.id] : [chosen.c.id, me.id];
  const f = chosen.f;
  const planned = state.plans[eweId] === ramId;
  const fin = flockStats(state, "fineness"), fw = flockStats(state, "fleeceWeight");
  const learn = f.learnBits > 1 ? "You would learn a lot from this lamb." : f.learnBits > 0.3 ? "You would learn something from this lamb." : "This lamb would teach you little new.";
  return `<h2>Find a mate for ${esc(me.name)}</h2>
  <div class="tabs">${goalTabs}</div>
  <div class="picker"><div class="cands">${list}</div>
  <div class="forecast">
    <h3>${esc(state.sheep[eweId]!.name)} × ${esc(state.sheep[ramId]!.name)}</h3>
    <div class="meta">If they had ten lambs…</div>
    ${litterRow(f.colour, f.horns, showNumbers)}
    ${rangeBar("Fibre fineness", "µm", f.fineness, fin.mean - 3 * fin.sd, fin.mean + 3 * fin.sd, Number(state.sheep[eweId]!.phenotype["fineness"]), Number(state.sheep[ramId]!.phenotype["fineness"]), fin.mean, showNumbers, true)}
    ${rangeBar("Fleece weight", "kg", f.fleeceWeight, fw.mean - 3 * fw.sd, fw.mean + 3 * fw.sd, Number(state.sheep[eweId]!.phenotype["fleeceWeight"]), Number(state.sheep[ramId]!.phenotype["fleeceWeight"]), fw.mean, showNumbers, false)}
    <div class="row"><span class="tag">${relationText(f.relatedness, f.inbreeding)}</span><span class="tag">🔍 ${learn}</span></div>
    <div class="row"><button data-plan="${eweId}:${ramId}" class="${planned ? "secondary" : ""}">${planned ? "Cancel this mating" : "Plan this mating"}</button>
      <span class="meta">${Object.keys(state.plans).length} mating(s) planned · sleep to see the lambs</span></div>
  </div></div>`;
}

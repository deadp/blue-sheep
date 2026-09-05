import { sheep as sheepDefs } from "@blue-sheep/genetics";
import { factsFor } from "../knowledge.js";
import { PENS, ZONE_LABEL, type ZoneId } from "../world/map.js";
import { ageOf, isAdult, seasonLabel, type GameState, type Sheep } from "../state.js";
import type { SeasonReport } from "../sim.js";


export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function sheepCardHtml(state: GameState, s: Sheep, spriteDataUrl: string): string {
  const age = ageOf(s, state.season);
  const adult = isAdult(s, state.season);
  const parents = s.dam
    ? `${esc(state.sheep[s.dam]?.name ?? "?")} × ${esc(state.sheep[s.sire!]?.name ?? "?")}`
    : "bought-in, no pedigree";
  const kids = Object.values(state.sheep).filter((k) => k.dam === s.id || k.sire === s.id);
  const facts = factsFor(state, s.id).filter((f) => !(f.locus === "A" && s.phenotype["colour"] !== "white"));
  const factList = facts.map((f) => {
    const dot = f.certain ? "●" : f.confidence > 0.85 ? "◕" : f.confidence > 0.6 ? "◑" : "○";
    return `<li class="${f.certain ? "certain" : ""}"><span class="dot" title="${Math.round(f.confidence * 100)}% sure">${dot}</span> ${esc(f.text)}${state.unlocks.includes("numbers") && !f.certain ? ` <span class="meta">(${Math.round(f.confidence * 100)}%)</span>` : ""}</li>`;
  }).join("");
  const plannedWith = s.sex === "ewe"
    ? (state.plans[s.id] ? [state.plans[s.id]!] : [])
    : Object.entries(state.plans).filter(([, r]) => r === s.id).map(([e]) => e);
  const planText = plannedWith.length ? `Planned with ${plannedWith.map((id) => esc(state.sheep[id]?.name ?? "?")).join(", ")}` : "No mating planned";
  const own = state.flock.includes(s.id);
  return `<div class="sheep-card">
    <img class="sprite" src="${spriteDataUrl}" alt="">
    <div>
      <div class="name">${esc(s.name)} ${s.sex === "ewe" ? "♀" : "♂"}</div>
      <div class="meta">${adult ? `${age} seasons old` : `lamb, ${age}/2`}${s.inbreeding > 0 ? ` · inbred F=${s.inbreeding.toFixed(2)}` : ""} · ${ZONE_LABEL[(state.zone[s.id] ?? "paddock") as ZoneId]}</div>
      <div class="meta">Parents: ${parents}${kids.length ? ` · ${kids.length} lamb(s): ${kids.map((k) => `${esc(k.name)} (${String(k.phenotype["colour"])})`).join(", ")}` : ""}</div>
      <div class="tags"><span>${String(s.phenotype["colour"])}</span><span>${String(s.phenotype["pattern"])}</span><span>${String(s.phenotype["horns"])}</span></div>
      ${own && adult ? `<div class="row"><button data-findmate="${s.id}">Find a mate</button><span class="meta">${planText}</span></div>` : ""}
    </div>
    <div class="notebook"><div class="meta">What you know about ${esc(s.name)} — ● certain ◕ likely ◑ leaning ○ unknown</div><ul class="facts">${factList}</ul></div>
  </div>`;
}

export function boardHtml(state: GameState): string {
  const inZone = (z: ZoneId) => state.flock.map((id) => state.sheep[id]!).filter((s) => (state.zone[s.id] ?? "paddock") === z);
  const pens = PENS.map((z) => {
    const occ = inZone(z);
    const rams = occ.filter((s) => s.sex === "ram" && isAdult(s, state.season));
    const ewes = occ.filter((s) => s.sex === "ewe" && isAdult(s, state.season));
    const status = rams.length === 0 ? "no ram — nothing will happen" : ewes.length === 0 ? "ram waiting for ewes" : `${esc(rams[0]!.name)} × ${ewes.map((e) => esc(e.name)).join(", ")}`;
    return `<div class="note"><b>${ZONE_LABEL[z]}</b><div>${occ.map((s) => esc(s.name)).join(", ") || "empty"}</div><div class="meta">${status}</div></div>`;
  }).join("");
  const log = state.log.slice(-8).reverse().map((l) => `<div>${esc(l.text)}</div>`).join("");
  const plans = Object.entries(state.plans).map(([e, r]) => `<div>${esc(state.sheep[e]?.name ?? "?")} × ${esc(state.sheep[r]?.name ?? "?")}</div>`).join("") || "<div class=meta>none — press I on a sheep, then Find a mate</div>";
  const cards = state.discoveries.slice(-6).reverse().map((d) => `<div class="card">${esc(d.text)}</div>`).join("") || "<div class=meta>none yet — surprising lambs teach you things</div>";
  return `<h2>Shed board</h2><div class="notes"><div class="note"><b>Planned matings</b>${plans}</div>${pens}
    <div class="note"><b>Paddock</b><div>${inZone("paddock").map((s) => esc(s.name)).join(", ") || "empty"}</div></div>
    <div class="note"><b>Goal</b><div>Breed a <b>blue</b> lamb. Blue needs a coloured (not white) black sheep with two copies of the hidden dilute allele.</div></div>
  </div><h3>Discoveries</h3><div class="cards">${cards}</div><h3>Diary</h3><div class="log">${log}</div>`;
}

export function reportHtml(state: GameState, r: SeasonReport, discoveries: { text: string }[] = []): string {
  const lambs = r.lambs.map((l) => `${esc(l.name)} (${String(l.phenotype["colour"])}${l.phenotype["horns"] === "horned" ? ", horned" : ""})`).join(", ");
  return `<h2>${seasonLabel(state.season)}</h2>
    <p>Wool sold: <b>+${r.income}</b> coins.</p>
    <p>${r.lambs.length ? `New lambs in the paddock: ${lambs}.` : "No lambs this season."}</p>
    ${r.messages.map((m) => `<p>${esc(m)}</p>`).join("")}
    ${discoveries.length ? `<h3>New discoveries</h3><div class="cards">${discoveries.map((d) => `<div class="card">✨ ${esc(d.text)}</div>`).join("")}</div>` : ""}
    <p class="meta">Press Esc or click outside to continue.</p>`;
}

export function helpHtml(): string {
  return `<h2>Welcome to the farm</h2>
  <p>Walk with <b>WASD</b> / arrows. Stand next to a sheep and press <b>E</b> to lead it; press <b>E</b> again to let it go. Press <b>I</b> to look at a sheep and write in your notebook.</p>
  <p>Press <b>I</b> on a sheep and choose <b>Find a mate</b>: the notebook forecasts what their lambs might look like from what you know so far. Plan a mating, then sleep in your <b>bed</b> to pass the season. Lambs appear in the paddock. (Putting a ram and ewes in a pen works too.)</p>
  <p>The <b>trader</b> by the cart sells sheep from far away. Lead a sheep to the cart and press <b>E</b> to sell it.</p>
  <p>Goal: breed a <b>blue</b> sheep. Check the shed board any time.</p>`;
}

export class Overlay {
  private el = document.querySelector<HTMLDivElement>("#overlay")!;
  onClose: (() => void) | null = null;
  constructor(private onAction: (data: DOMStringMap) => void) {
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) { this.close(); return; }
      const b = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
      if (b && !b.disabled) this.onAction(b.dataset);
    });
  }
  get open(): boolean { return !this.el.hidden; }
  show(html: string, wide = false): void {
    this.el.innerHTML = `<div class="panel ${wide ? "wide" : ""}">${html}</div>`;
    this.el.hidden = false;
  }
  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.onClose?.();
  }
}

export function setHud(html: string): void {
  document.querySelector<HTMLDivElement>("#hud")!.innerHTML = html;
}

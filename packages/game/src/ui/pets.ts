/** The farm animals that aren't sheep: the dogs and the cat. Their card, and their cards at the market. */
import {
  PET_KIND, PET_NAME, PET_SEX, WOLF_MIN_ACT, catCatch, forecastUpgrade, fondnessOf, isPetId,
  miceComingText, oddsLabel, ownedDogs, ownedPets, petEffort, predatorRisk,
  type GameState, type PetId,
} from "../core/index.js";
import { careHtml, treatButton } from "./sheep.js";
import { esc, heartMeter, oddsMeter, numbersOn } from "./util.js";
import { btn, head, icon, more, type IconName } from "./felt/index.js";
import type { View } from "./view.js";

export const PET_ICON: Record<PetId, IconName> = { terrier: "dog", collie: "dog", maremma: "dog", cat: "cat" };

const PET_LINE: Record<PetId, string> = {
  terrier: "Scruffy, fearless and far too loud. Barks at foxes, crows, the post and her own tail.",
  collie: "Clever and busy. Rounds up the lambs at dusk whether they like it or not.",
  maremma: "A big white guardian who sleeps among the flock. Gentle with lambs, a wall to wolves.",
  cat: "Sits on the barn roof, stalks the hay bales and naps in any patch of sun.",
};

/** The pet a card is about: the view's id if it's an owned pet, else the first owned one. */
export function petSubject(state: GameState, view: View): PetId | null {
  const own = ownedPets(state);
  const id = view.sheepId;
  if (id && isPetId(id) && own.includes(id)) return id;
  return own[0] ?? null;
}

/** Fox / wolf odds rows: "now → with" (with = null for a single column). */
export function predatorRows(state: GameState, fox: { now: number; with: number | null }, wolf: { now: number; with: number | null } | null, withLabel: string | null): string {
  const cell = (p: number) => oddsMeter(state, p, { compact: true, risk: true, label: `${oddsLabel(p)} to take a lamb` });
  const two = withLabel !== null;
  // Before/after rows where nothing would change (a bold sheep already sees foxes off; a terrier and a wolf)
  // are left out: the sentence under them says why.
  const same = (r: { now: number; with: number | null }) => r.with !== null && Math.abs(r.now - r.with) < 0.005;
  const row = (kind: string, ic: IconName, name: string, r: { now: number; with: number | null }) => same(r) ? "" :
    `<span class="p-lbl">${icon(ic, "inl")} ${esc(name)}</span><span class="p-cell now ${kind}">${two ? `<span class="p-head">now</span>` : ""}${cell(r.now)}</span>${two && r.with !== null ? `<span class="p-arrow">→</span><span class="p-cell with ${kind}"><span class="p-head">${esc(withLabel!)}</span>${cell(r.with)}</span>` : ""}`;
  const rows = `${row("fox", "fox", "A fox gets a lamb", fox)}${wolf ? row("wolf", "wolf", "A wolf gets a lamb", wolf) : ""}`;
  return rows ? `<div class="pet-odds ${two ? "two" : "one"}" aria-label="Odds a predator takes a lamb">${rows}</div>` : "";
}

/** What a dog or the cat does for the farm today (with its fondness). */
function petJob(state: GameState, id: PetId): string {
  const name = PET_NAME[id];
  const pro = PET_SEX[id];
  if (id === "cat") {
    const c = catCatch(state);
    const soon = miceComingText(state);
    return `<p class="meta">${icon("mouse", "inl")} ${name} catches ${c >= 0.999 ? "every mouse in the barn" : c >= 0.9 ? "nearly every mouse in the barn" : "most of the mice in the barn"}${numbersOn(state) ? ` (${Math.round(c * 100)}%)` : ""}, so they can't spoil the wool or eat the hay.</p>${soon ? `<p class="meta">${icon("mouse", "inl")} ${esc(soon)}</p>` : ""}`;
  }
  const dogs = ownedDogs(state);
  const wolves = state.act >= WOLF_MIN_ACT || state.pendingEvent?.kind === "wolf";
  const fox = { now: predatorRisk(state, "fox", dogs), with: null };
  const wolf = wolves ? { now: predatorRisk(state, "wolf", dogs), with: null } : null;
  const pack = dogs.length > 1 ? `With ${dogs.filter((d) => d !== id).map((d) => PET_NAME[d]).join(" and ")}, on watch at night` : "On watch at night";
  const coming = state.pendingEvent?.kind === "fox" ? `<p class="meta">${icon("fox", "inl")} A fox has been seen — it comes this winter.</p>` : state.pendingEvent?.kind === "wolf" ? `<p class="meta">${icon("wolf", "inl")} A wolf is coming this winter.</p>` : "";
  return `<p class="meta">${pack}. The odds a predator takes a lamb:</p>
    ${predatorRows(state, fox, wolf, null)}
    ${coming}
    <p class="meta">${cap(pro)} works harder the fonder ${pro} is of you${numbersOn(state) ? ` (${Math.round(petEffort(state, id) * 100)}%)` : ""}.</p>`;
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function animalCardHtml(state: GameState, view: View): string {
  const id = petSubject(state, view);
  if (!id) {
    return `${head("paw", "No farm animals yet", 2)}<p>A dog keeps foxes off the lambs; a cat keeps mice out of the barn. Find them at the market.</p>
      <div class="row">${btn("Go to the market", { kind: "primary", icon: "store", data: { open: "market" } })}</div>`;
  }
  let art = "";
  try { art = view.petArt?.(id) ?? ""; } catch { art = ""; }
  const others = ownedPets(state).filter((p) => p !== id);
  return `<div class="sheep-card animal-card" data-pet="${esc(id)}">
    <div class="sc-stage pet-stage" style="--bg:${id === "cat" ? "#f4e6d2" : id === "maremma" ? "#dcebd6" : "#d6e5f0"}">${art ? `<img src="${esc(art)}" alt="">` : icon(PET_ICON[id], "xl")}</div>
    <div class="sc-name"><h2 class="nm">${esc(PET_NAME[id])}</h2></div>
    <div class="sc-persona"><span class="persona calm">${icon(PET_ICON[id])}${esc(PET_KIND[id])}</span></div>
    ${careHtml(state, id)}
    <p class="sc-line">${esc(PET_LINE[id])}</p>
    <div class="pet-job">${petJob(state, id)}</div>
    <div class="card-acts">${treatButton(state, id)}</div>
    ${others.length ? `<div class="sc-family"><span class="lbl">Also here</span> ${others.map((p) => `<button class="chip" data-open="animal" data-sheep-id="${p}">${icon(PET_ICON[p], "inl")}<span class="nm">${esc(PET_NAME[p])}</span></button>`).join(" ")}</div>` : ""}
  </div>`;
}

/** Owned animals as chips with hearts (board, market). */
export function myAnimalsHtml(state: GameState): string {
  const own = ownedPets(state);
  if (!own.length) return "";
  return `<div class="my-animals">${own.map((p) => `<button class="chip" data-open="animal" data-sheep-id="${p}" title="Visit ${esc(PET_NAME[p])}">${icon(PET_ICON[p], "inl")}<span class="nm">${esc(PET_NAME[p])}</span> ${heartMeter(state, fondnessOf(state, p), { compact: true })}</button>`).join("")}</div>`;
}

/** The forecast part of a dog's or the cat's market card: odds before and after buying it. */
export function petForecastHtml(state: GameState, id: PetId): string {
  const f = forecastUpgrade(state, id);
  if (f.risk) {
    const wolves = id === "maremma" || state.act >= WOLF_MIN_ACT || state.pendingEvent?.kind === "wolf";
    return `${predatorRows(state, f.risk.fox, wolves ? f.risk.wolf : null, `with ${PET_NAME[id]}`)}${more(`pet-${id}`, "In words", `<div class="u-fore">${esc(f.text)}</div>`, { cls: "mini" })}`;
  }
  if (f.mice) {
    return `<div class="pet-mice">${icon("mouse", "inl")} A mouse season costs <span class="coins">about ${f.mice.now} coins</span> → <span class="coins good">about ${f.mice.with} with ${esc(PET_NAME.cat)}</span></div><div class="u-fore">${esc(f.text)}</div>`;
  }
  return `<div class="u-fore">${esc(f.text)}</div>`;
}

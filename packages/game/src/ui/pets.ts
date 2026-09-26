/** The farm animals that aren't sheep: the dogs and the cat. Their card, and their cards at the market. */
import {
  PET_KIND, PET_NAME, PET_SEX, WOLF_MIN_ACT, catCatch, forecastUpgrade, fondnessOf, isPetId,
  miceComingText, oddsLabel, ownedDogs, ownedPets, petEffort, predatorRisk,
  type GameState, type PetId,
} from "../core/index.js";
import { careHtml } from "./sheep.js";
import { esc, heartMeter, oddsMeter, numbersOn } from "./util.js";
import type { View } from "./view.js";

export const PET_ICON: Record<PetId, string> = { terrier: "🐕", collie: "🐕", maremma: "🐕‍🦺", cat: "🐈" };

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
  const row = (kind: string, icon: string, name: string, r: { now: number; with: number | null }) => same(r) ? "" :
    `<span class="p-lbl">${icon} ${esc(name)}</span><span class="p-cell now ${kind}">${two ? `<span class="p-head">now</span>` : ""}${cell(r.now)}</span>${two && r.with !== null ? `<span class="p-arrow">→</span><span class="p-cell with ${kind}"><span class="p-head">${esc(withLabel!)}</span>${cell(r.with)}</span>` : ""}`;
  const rows = `${row("fox", "🦊", "A fox gets a lamb", fox)}${wolf ? row("wolf", "🐺", "A wolf gets a lamb", wolf) : ""}`;
  return rows ? `<div class="pet-odds ${two ? "two" : "one"}" aria-label="Odds a predator takes a lamb">${rows}</div>` : "";
}

/** What a dog or the cat does for the farm today (with its fondness). */
function petJob(state: GameState, id: PetId): string {
  const name = PET_NAME[id];
  const pro = PET_SEX[id];
  if (id === "cat") {
    const c = catCatch(state);
    const soon = miceComingText(state);
    return `<p>${name} catches ${c >= 0.999 ? "every mouse in the barn" : c >= 0.9 ? "nearly every mouse in the barn" : "most of the mice in the barn"}${numbersOn(state) ? ` (${Math.round(c * 100)}%)` : ""}, so they can't spoil the wool or eat the hay.</p>${soon ? `<p class="meta">🐭 ${esc(soon)}</p>` : ""}`;
  }
  const dogs = ownedDogs(state);
  const wolves = state.act >= WOLF_MIN_ACT || state.pendingEvent?.kind === "wolf";
  const fox = { now: predatorRisk(state, "fox", dogs), with: null };
  const wolf = wolves ? { now: predatorRisk(state, "wolf", dogs), with: null } : null;
  const pack = dogs.length > 1 ? `With ${dogs.filter((d) => d !== id).map((d) => PET_NAME[d]).join(" and ")}, your dogs` : "Your dogs";
  const coming = state.pendingEvent?.kind === "fox" ? "<p class=\"meta\">🦊 A fox has been seen — it comes this winter.</p>" : state.pendingEvent?.kind === "wolf" ? "<p class=\"meta\">🐺 A wolf is coming this winter.</p>" : "";
  return `<p>${pack} keep watch at night. If a predator comes and there are lambs in the field:</p>
    ${predatorRows(state, fox, wolf, null)}
    ${coming}
    <p class="meta">${cap(pro)} guards a little harder the fonder ${pro} is of you${numbersOn(state) ? ` (working at ${Math.round(petEffort(state, id) * 100)}%)` : ""}.</p>`;
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function animalCardHtml(state: GameState, view: View): string {
  const id = petSubject(state, view);
  if (!id) {
    return `<h2>No farm animals yet</h2><p>A dog keeps foxes (and later wolves) off the lambs, and a cat keeps mice out of the barn. The market sells them under <b>Farm improvements</b>.</p>
      <div class="row"><button class="primary" data-open="market">Go to the market</button></div>`;
  }
  let art = "";
  try { art = view.petArt?.(id) ?? ""; } catch { art = ""; }
  const others = ownedPets(state).filter((p) => p !== id);
  const effect = "";
  return `<div class="sheep-card animal-card" data-pet="${esc(id)}">
    <div class="sc-stage pet-stage" style="--bg:${id === "cat" ? "#f2e1c8" : id === "maremma" ? "#d6e6d0" : "#cfe0ee"}">${art ? `<img src="${esc(art)}" alt="">` : `<span aria-hidden="true">${PET_ICON[id]}</span>`}</div>
    <div class="sc-main">
      <div class="sc-name"><h2>${esc(PET_NAME[id])}</h2></div>
      <div class="sc-persona"><span class="persona calm">${PET_ICON[id]} ${esc(PET_KIND[id])}</span></div>
      <p class="sc-line">${esc(PET_LINE[id])}</p>
      ${petJob(state, id)}
    </div>
    ${careHtml(state, id, effect)}
    ${others.length ? `<div class="sc-family"><div><span class="lbl">Also on the farm</span> ${others.map((p) => `<button class="chip" data-open="animal" data-sheep-id="${p}">${PET_ICON[p]} ${esc(PET_NAME[p])}</button>`).join(" ")}</div></div>` : ""}
  </div>`;
}

/** Owned animals as chips with hearts (board, market). */
export function myAnimalsHtml(state: GameState): string {
  const own = ownedPets(state);
  if (!own.length) return "";
  return `<div class="my-animals">${own.map((p) => `<button class="chip" data-open="animal" data-sheep-id="${p}" title="Visit ${esc(PET_NAME[p])}">${PET_ICON[p]} ${esc(PET_NAME[p])} ${heartMeter(state, fondnessOf(state, p), { compact: true })}</button>`).join("")}</div>`;
}

/** The forecast part of a dog's or the cat's market card: odds before and after buying it. */
export function petForecastHtml(state: GameState, id: PetId): string {
  const f = forecastUpgrade(state, id);
  if (f.risk) {
    const wolves = id === "maremma" || state.act >= WOLF_MIN_ACT || state.pendingEvent?.kind === "wolf";
    return `${predatorRows(state, f.risk.fox, wolves ? f.risk.wolf : null, `with ${PET_NAME[id]}`)}<div class="u-fore">${esc(f.text)}</div>`;
  }
  if (f.mice) {
    return `<div class="pet-mice">🐭 A mouse season costs <span class="coins">about ${f.mice.now} coins</span> → <span class="coins good">about ${f.mice.with} with ${esc(PET_NAME.cat)}</span></div><div class="u-fore">${esc(f.text)}</div>`;
  }
  return `<div class="u-fore">${esc(f.text)}</div>`;
}

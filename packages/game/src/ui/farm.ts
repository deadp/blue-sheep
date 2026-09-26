/** Market (buy, sell, visiting ram), vet and fair panels. */
import {
  FAIR_LABEL, FAIR_PRIZES, PET_NAME, TEST_LOCI, UPGRADES, VET_FEE, buyPrice, feedPerHead, fondnessOf, forecastUpgrade, hasUpgrade, isPetId, upgradeBlocked, canBreed, factsFor, forecastFair, forecastVet, forecastVisitor,
  isAdult, oddsLabel, seasonLabel, sheepValue, yearOf,
  type CrossForecast, type GameState, type Sheep,
} from "../core/index.js";
import { litterRow, litterWords } from "./forecast.js";
import { ageWords, chip, dot, esc, has, heartMeter, learnMeter, learnWord, numbersOn, pips, portrait, sexMark, swatch, traitWords, LOCUS_FRIENDLY } from "./util.js";
import type { View } from "./view.js";
import { crossCached } from "./cache.js";
import { PET_ICON, petForecastHtml } from "./pets.js";

/** Best pairing of an outside sheep with the flock, by blue chance then learning. */
function bestMatch(state: GameState, s: Sheep): { mate: Sheep; f: CrossForecast } | null {
  const mates = state.flock.map((id) => state.sheep[id]!).filter((m) => m.sex !== s.sex && canBreed(m, state.season));
  let best: { mate: Sheep; f: CrossForecast; score: number } | null = null;
  for (const m of mates.slice(0, 12)) {
    let f: CrossForecast;
    try { f = s.sex === "ram" ? crossCached(state, m.id, s.id) : crossCached(state, s.id, m.id); } catch { continue; }
    const score = (f.colour["blue"] ?? 0) * 10 + f.learnBits * 0.1 - f.inbreeding;
    if (!best || score > best.score) best = { mate: m, f, score };
  }
  return best;
}

function wouldAdd(state: GameState, view: View, s: Sheep): string {
  const b = bestMatch(state, s);
  if (!b) return `<div class="meta">No ${s.sex === "ram" ? "ewes" : "rams"} in your flock to pair with yet.</div>`;
  return `<div class="adds"><div class="meta">Best pairing: with ${esc(b.mate.name)} — ${esc(litterWords(state, b.f.colour))}</div>${litterRow(state, b.f, true, view)}</div>`;
}

function marketCard(state: GameState, view: View, s: Sheep): string {
  const price = buyPrice(s);
  const full = state.flock.length >= state.flockCap;
  const poor = state.money < price;
  const traits = traitWords(state, s).slice(0, 3).map((t) => `${t.label.toLowerCase()}: ${t.text}`).join(" · ");
  return `<div class="mcard">
    ${portrait(view, s, "md")}
    <div class="m-body">
      <div class="m-name"><b>${esc(s.name)}</b> ${sexMark(s)} <span class="tag">${swatch(String(s.phenotype["colour"]))}${esc(s.phenotype["colour"])}</span> <span class="meta">${esc(s.phenotype["horns"])} · ${esc(ageWords(state, s))}</span></div>
      <div class="meta">${esc(traits)}</div>
      <div class="meta">What we know: nothing but looks — bought in, no pedigree.</div>
      ${wouldAdd(state, view, s)}
    </div>
    <div class="m-buy"><div class="price">${price} coins</div>
      <button class="primary" data-buy="${esc(s.id)}" ${full || poor ? "disabled" : ""}>Buy</button>
      ${full ? `<div class="meta">Fields full</div>` : poor ? `<div class="meta">Not enough coins</div>` : ""}</div>
  </div>`;
}

/** One improvement card: what it would change for this farm (the forecast) next to the Buy button. */
function upgradeCard(state: GameState, u: (typeof UPGRADES)[number]): string {
  const owned = hasUpgrade(state, u.id);
  const blocked = owned ? null : upgradeBlocked(state, u.id);
  const locked = !owned && (state.act < u.minAct || (u.requires !== null && !hasUpgrade(state, u.requires)));
  const pet = isPetId(u.id) ? u.id : null;
  let fore = "";
  if (!owned && !locked) fore = pet ? petForecastHtml(state, pet) : `<div class="u-fore">${esc(forecastUpgrade(state, u.id).text)}</div>`;
  if (owned && pet) fore = `<div class="u-fore">${heartMeter(state, fondnessOf(state, pet), { compact: true })} <button class="link" data-open="animal" data-sheep-id="${pet}">Visit ${esc(PET_NAME[pet])}</button></div>`;
  const act = owned
    ? `<span class="tag ok">Yours ✓</span>`
    : `<div class="price">${u.price} coins</div><button class="primary" data-upgrade="${u.id}" ${blocked ? "disabled" : ""}>Buy</button>${blocked && !locked ? `<div class="meta">Not enough coins</div>` : ""}`;
  return `<div class="mcard upgrade ${owned ? "owned" : ""} ${locked ? "locked" : ""} ${pet ? "pet" : ""}" data-upgrade-card="${u.id}">
      <div class="u-icon" aria-hidden="true">${pet ? PET_ICON[pet] : u.icon}</div>
      <div class="m-body"><div class="m-name"><b>${esc(u.name)}</b></div>
        <div class="meta">${esc(u.blurb)}</div>
        ${locked ? `<div class="meta">🔒 ${esc(blocked ?? "")}</div>` : fore}</div>
      <div class="m-buy">${act}</div>
    </div>`;
}

/** Farm animals (dogs, the cat) and farm improvements, each with its forecast before buying. */
function upgradesHtml(state: GameState): string {
  const pets = UPGRADES.filter((u) => isPetId(u.id)).map((u) => upgradeCard(state, u)).join("");
  const rows = UPGRADES.filter((u) => !isPetId(u.id)).map((u) => upgradeCard(state, u)).join("");
  const feed = feedPerHead(state.season);
  const year = yearOf(state.season);
  let rise = "That's as dear as hay gets.";
  for (let y = year + 1; y <= year + 12; y++) {
    const f = feedPerHead(y * 4);
    if (f > feed) { rise = `It goes up to ${f} in Year ${y + 1}.`; break; }
  }
  return `<h3>Dogs and a cat</h3>
    <p class="meta">Dogs keep watch together: each one you add makes the lambs safer. The bars show the odds a predator gets a lamb, now and with that dog.</p>
    ${pets}
    <h3>Farm improvements</h3>
    <p class="meta">One-time purchases. Feed costs ${feed} coins a sheep this season. ${rise}</p>
    ${rows}`;
}

export function marketHtml(state: GameState, view: View): string {
  const stock = state.market.map((id) => state.sheep[id]).filter((s): s is Sheep => !!s);
  const v = state.visitingRam && state.visitingRam.season === state.season ? state.visitingRam : null;
  const vr = v ? state.sheep[v.id] : undefined;
  let visitor = "";
  if (v && vr && has(state, "visitor")) {
    const hired = state.hiredRam === vr.id;
    visitor = `<h3>Visiting ram</h3>
      <div class="mcard visitor">${portrait(view, vr, "md")}
        <div class="m-body"><div class="m-name"><b>${esc(vr.name)}</b> ${sexMark(vr)} <span class="tag">${swatch(String(vr.phenotype["colour"]))}${esc(vr.phenotype["colour"])}</span></div>
          <div class="meta">From over the hills, here this season only. Nothing is known about his family, so forecasts with him are wide — fresh blood, though, and no shared kin.</div>
          <div class="visitor-fore">${esc(forecastVisitor(state).text)}</div>
          ${wouldAdd(state, view, vr)}</div>
        <div class="m-buy"><div class="price">${v.fee} coins</div>
          ${hired ? `<span class="tag ok">Hired ✓</span>` : `<button class="primary" data-hire="1" ${state.money < v.fee ? "disabled" : ""}>Hire</button>`}</div>
      </div>`;
  }
  const flock = state.flock.map((id) => state.sheep[id]!).map((s) => {
    const planned = state.plans[s.id] || Object.values(state.plans).includes(s.id);
    const entered = state.fair.entry === s.id;
    return `<li>${chip(state, s)} <span class="meta">${esc(ageWords(state, s))}${planned ? " · ★ planned (would be cancelled)" : ""}${entered ? " · entered for the fair" : ""}</span>
      <button class="secondary small" data-sell="${esc(s.id)}">Sell · ${sheepValue(s, state.season)}</button></li>`;
  }).join("");
  return `<h2>Market</h2>
    <p class="meta">The trader brings new sheep every season. You have ${state.money} coins and room for ${Math.max(0, state.flockCap - state.flock.length)} more.</p>
    <h3>For sale</h3>
    ${stock.length ? stock.map((s) => marketCard(state, view, s)).join("") : `<p class="meta">Sold out — come back next season.</p>`}
    ${visitor}
    ${upgradesHtml(state)}
    <h3>Your flock (${state.flock.length} of ${state.flockCap})</h3>
    <ul class="sell-list">${flock}</ul>`;
}

// ---- Vet --------------------------------------------------------------------

export function vetHtml(state: GameState, view: View): string {
  if (!has(state, "vet")) return `<h2>Vet</h2><p>The vet's hut is shut for now. Hidden things will need testing soon enough.</p>`;
  const pool = state.flock.map((id) => state.sheep[id]!);
  const v = state.visitingRam && state.visitingRam.season === state.season ? state.sheep[state.visitingRam.id] : undefined;
  if (v) pool.push(v);
  const chosen = (view.tab && pool.find((s) => s.id === view.tab)) || (view.sheepId && pool.find((s) => s.id === view.sheepId)) || pool[0];
  const picker = pool.map((s) => `<button class="chip ${s.id === chosen?.id ? "on" : ""}" data-tab="${esc(s.id)}">${swatch(String(s.phenotype["colour"]))}${esc(s.name)}</button>`).join("");
  if (!chosen) return `<h2>Vet</h2><p>No sheep to test.</p>`;
  const facts = new Map(factsFor(state, chosen.id).map((f) => [f.locus, f]));
  const rows = TEST_LOCI.map((l) => {
    let fv = { gainBits: 0, text: "" };
    try { fv = forecastVet(state, chosen.id, l); } catch { /* skip */ }
    const fact = facts.get(l);
    const tested = !!chosen.tested[l];
    const v = Math.min(1, fv.gainBits * 0.64);
    return `<div class="vet-row ${tested ? "done" : ""}">
      <div class="v-label"><b>${esc(LOCUS_FRIENDLY[l] ?? l)}</b>${fact ? `<div class="meta">${dot(fact.confidence, fact.certain)} ${esc(fact.text.replace(/^[^:]+: /, ""))}</div>` : ""}</div>
      <div class="v-fore">${learnMeter(v, learnWord(v), { label: "how much you'd learn" })}<div class="meta">${esc(fv.text)}</div></div>
      <div class="v-act">${tested ? `<span class="tag ok">Tested ✓</span>` : `<button class="primary" data-test="${esc(chosen.id)}:${l}" ${state.money < VET_FEE ? "disabled" : ""}>Test · ${VET_FEE}</button>`}</div>
    </div>`;
  }).join("");
  return `<h2>Vet</h2>
    <p class="meta">The vet can read one hidden trait per test. Each costs ${VET_FEE} coins — the bar shows how much it would teach you.</p>
    <div class="chips" role="tablist">${picker}</div>
    <div class="vet-sheep">${portrait(view, chosen, "sm")}<div><b>${esc(chosen.name)}</b> ${sexMark(chosen)} <span class="meta">${esc(chosen.phenotype["colour"])}, ${esc(chosen.phenotype["pattern"])}, ${esc(chosen.phenotype["horns"])}</span></div></div>
    <div class="vet-rows">${rows}</div>`;
}

// ---- Fair -------------------------------------------------------------------

export function fairHtml(state: GameState, view: View): string {
  if (!has(state, "fair")) return `<h2>Village fair</h2><p>The fairground is quiet. The village fair will invite you once your wool is known.</p>`;
  const cat = state.fair.category;
  const when = state.fair.nextSeason - state.season;
  const eligible = state.flock.map((id) => state.sheep[id]!).filter((s) => isAdult(s, state.fair.nextSeason));
  const scored = eligible.map((s) => ({ s, f: forecastFair(state, s.id) })).sort((a, b) => b.f.pWin - a.f.pWin || b.f.pPlace - a.f.pPlace);
  const entry = state.fair.entry ? state.sheep[state.fair.entry] : undefined;
  const list = scored.map(({ s, f }) => {
    const on = entry?.id === s.id;
    return `<div class="fair-row ${on ? "on" : ""}">
      ${portrait(view, s, "sm")}
      <div class="f-name">${chip(state, s)}<div class="meta">${esc(traitWords(state, s).find((t) => (cat === "fine" ? t.label === "Wool" : cat === "heavy" ? t.label === "Fleece" : cat === "big" ? t.label === "Build" : false))?.text ?? `${s.phenotype["colour"]}${s.phenotype["pattern"] === "spotted" ? ", spotted" : ""}`)}</div></div>
      <div class="f-odds"><div class="f-odd"><span class="f-lbl">🏵 Win</span> ${pips(state, f.pWin, `First place: ${oddsLabel(f.pWin)}`, true)}</div><div class="f-odd"><span class="f-lbl">🎗 Top three</span> ${pips(state, f.pPlace, `Top three: ${oddsLabel(f.pPlace)}`)}</div><div class="meta">${esc(f.text)}</div></div>
      <div class="f-act">${on ? `<button class="secondary" data-enter="none">Withdraw</button>` : `<button class="primary" data-enter="${esc(s.id)}">Enter</button>`}</div>
    </div>`;
  }).join("");
  const hist = state.fair.history.slice(-5).reverse().map((h) =>
    `<li><span class="when">${esc(seasonLabel(h.season))}</span> ${esc(FAIR_LABEL[h.category])}: ${h.place ? `${esc(h.entryName ?? "")} came ${h.place === 1 ? "first 🏵" : h.place === 2 ? "second" : h.place === 3 ? "third" : `${h.place}th`}${h.prize ? ` (+${h.prize} coins)` : ""}` : "no entry"}</li>`).join("");
  return `<h2>Village fair</h2>
    <div class="fair-banner"><div class="big">🎪 ${esc(FAIR_LABEL[cat])}</div>
      <div>${when <= 0 ? "Judging is this season — the results come when you sleep." : `${esc(seasonLabel(state.fair.nextSeason))} · ${when} season${when === 1 ? "" : "s"} away`}</div>
      <div class="meta">Prizes: ${FAIR_PRIZES.join(", ")} coins for first to third. First place wins a rosette. The field gets stronger every year.</div></div>
    <p><b>Your entry:</b> ${entry ? `${chip(state, entry)}` : `<span class="meta">none yet</span>`}</p>
    <h3>Who could you show?</h3>
    ${list || `<p class="meta">No sheep will be grown up in time.</p>`}
    ${hist ? `<h3>Past fairs</h3><ul class="plain">${hist}</ul>` : ""}
    `;
}

/** Market (buy, sell, visiting ram), vet and fair panels. */
import {
  lambRoom, FAIR_LABEL, FAIR_PRIZES, PET_NAME, TEST_LOCI, UPGRADES, VET_FEE, buyPrice, feedPerHead, fondnessOf, forecastUpgrade, hasUpgrade, isPetId, upgradeBlocked, upgradeOffered, canBreed, factsFor, forecastFair, forecastVet, forecastVisitor,
  isAdult, oddsLabel, seasonLabel, sheepValue, yearOf,
  type CrossForecast, type GameState, type Sheep,
} from "../core/index.js";
import { litterRow, litterWords } from "./forecast.js";
import { ageWords, chip, dot, esc, has, heartMeter, learnMeter, learnWord, oddsScale, pips, portrait, sexMark, swatch, traitWords, LEARN_SCALE, LOCUS_FRIENDLY } from "./util.js";
import { btn, head, icon, more, nm, tag, type IconName } from "./felt/index.js";
import type { View } from "./view.js";
import { crossCached } from "./cache.js";
import { petForecastHtml } from "./pets.js";

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
  if (!b) return `<div class="adds meta">No ${s.sex === "ram" ? "ewes" : "rams"} in your flock to pair with yet.</div>`;
  return `<div class="adds" title="${esc(litterWords(state, b.f.colour))}"><span class="meta">Best pairing: ${nm(esc(b.mate.name))}</span>${litterRow(state, b.f, true, view)}</div>`;
}

function marketCard(state: GameState, view: View, s: Sheep): string {
  const price = buyPrice(s);
  const full = state.flock.length >= state.flockCap;
  const poor = state.money < price;
  const traits = traitWords(state, s).slice(0, 3).map((t) => `${t.label.toLowerCase()}: ${t.text}`).join(" · ");
  return `<div class="mcard">
    ${portrait(view, s, "md")}
    <div class="m-body">
      <div class="m-name">${nm(esc(s.name))} ${sexMark(s)} ${tag(`${swatch(String(s.phenotype["colour"]))}${esc(String(s.phenotype["colour"]))}`, { cls: "sw" })} ${s.phenotype["horns"] === "horned" ? icon("horn", "inl") : ""}</div>
      ${wouldAdd(state, view, s)}
      ${more(`buy-${s.id}`, "More", `<div class="meta">${esc(traits)} · ${esc(ageWords(state, s))}</div><div class="meta">What we know: nothing but looks — bought in, no pedigree.</div>`, { cls: "mini" })}
    </div>
    <div class="m-buy">${tag(`${price}`, { icon: "coin", tone: "butter", cls: "price", title: "Price in coins" })}
      ${btn("Buy", { kind: "secondary", icon: "coin", data: { buy: s.id }, disabled: full || poor, title: full ? "Fields full" : poor ? "Not enough coins" : "" })}
      ${full ? `<div class="meta">Fields full</div>` : poor ? `<div class="meta">Short of coins</div>` : ""}</div>
  </div>`;
}

const UPGRADE_ICON: Record<string, IconName> = { paddock: "fence", barn: "barn", shearing: "scissors", meadow: "hay", terrier: "dog", collie: "dog", maremma: "dog", cat: "cat" };

/** One improvement card: what it would change for this farm (the forecast) next to the Buy button. */
function upgradeCard(state: GameState, u: (typeof UPGRADES)[number]): string {
  const owned = hasUpgrade(state, u.id);
  const blocked = owned ? null : upgradeBlocked(state, u.id);
  const locked = !owned && (state.act < u.minAct || (u.requires !== null && !hasUpgrade(state, u.requires)));
  const pet = isPetId(u.id) ? u.id : null;
  let fore = "";
  if (!owned && !locked) fore = pet ? petForecastHtml(state, pet) : `<div class="u-fore">${esc(forecastUpgrade(state, u.id).text)}</div>`;
  if (owned && pet) fore = `<div class="u-fore">${heartMeter(state, fondnessOf(state, pet), { compact: true })} ${btn(`Visit ${esc(PET_NAME[pet])}`, { kind: "ghost", icon: "paw", data: { open: "animal", "sheep-id": pet } })}</div>`;
  const act = owned
    ? tag(`Yours ${icon("check", "sm")}`, { tone: "sage", cls: "ok" })
    : `${tag(`${u.price}`, { icon: "coin", tone: "butter", cls: "price", title: "Price in coins" })}${btn("Buy", { kind: "secondary", icon: "coin", data: { upgrade: u.id }, disabled: !!blocked, title: blocked && !locked ? "Not enough coins" : "" })}`;
  return `<div class="mcard upgrade ${owned ? "owned" : ""} ${locked ? "locked" : ""} ${pet ? "pet" : ""}" data-upgrade-card="${u.id}">
      <div class="u-icon" aria-hidden="true">${icon(UPGRADE_ICON[u.id] ?? "barn", "xl")}</div>
      <div class="m-body"><div class="m-name" title="${esc(u.blurb)}"><b>${esc(u.name)}</b></div>
        ${locked ? `<div class="meta">${icon("lock", "inl")} ${esc(blocked ?? "")}</div>` : fore}</div>
      <div class="m-buy">${act}</div>
    </div>`;
}

/** Farm animals (dogs, the cat) and farm improvements, each with its forecast before buying. */
function upgradesHtml(state: GameState): string {
  // Only what has arrived at the market so far (core/pacing.ts): improvements, then dogs, then the cat.
  const offered = UPGRADES.filter((u) => upgradeOffered(state, u.id));
  const pets = offered.filter((u) => isPetId(u.id)).map((u) => upgradeCard(state, u)).join("");
  const rows = offered.filter((u) => !isPetId(u.id)).map((u) => upgradeCard(state, u)).join("");
  if (!pets && !rows) return "";
  const feed = feedPerHead(state.season);
  const year = yearOf(state.season);
  let rise = "";
  for (let y = year + 1; y <= year + 12; y++) {
    const f = feedPerHead(y * 4);
    if (f > feed) { rise = ` (${f} from Year ${y + 1})`; break; }
  }
  const dogs = offered.some((u) => u.id === "terrier");
  return `${pets ? `${head(dogs ? "dog" : "cat", dogs && upgradeOffered(state, "cat") ? "Dogs and a cat" : dogs ? "Dogs" : "A cat")}
    ${dogs ? `<p class="meta">${icon("fox", "inl")} The bars: the odds a predator gets a lamb, now and with that dog. Every dog adds to the watch.</p>` : ""}
    ${pets}` : ""}
    ${rows ? `${head("barn", "Farm improvements")}
    <p class="meta">${icon("hay", "inl")} Feed: ${feed} coins a sheep this season${rise}.</p>
    ${rows}` : ""}`;
}

export function marketHtml(state: GameState, view: View): string {
  const stock = state.market.map((id) => state.sheep[id]).filter((s): s is Sheep => !!s);
  const v = state.visitingRam && state.visitingRam.season === state.season ? state.visitingRam : null;
  const vr = v ? state.sheep[v.id] : undefined;
  let visitor = "";
  if (v && vr && has(state, "visitor")) {
    const hired = state.hiredRam === vr.id;
    visitor = `${head("ram", "Visiting ram")}
      <div class="mcard visitor">${portrait(view, vr, "md")}
        <div class="m-body"><div class="m-name">${nm(esc(vr.name))} ${sexMark(vr)} ${tag(`${swatch(String(vr.phenotype["colour"]))}${esc(String(vr.phenotype["colour"]))}`)}</div>
          <div class="visitor-fore">${esc(forecastVisitor(state).text)}</div>
          ${wouldAdd(state, view, vr)}
          ${more("visitor-more", "About him", `<div class="meta">From over the hills, here this season only. Nothing is known about his family, so forecasts with him are wide — fresh blood, though, and no shared kin.</div>`, { cls: "mini" })}</div>
        <div class="m-buy">${tag(`${v.fee}`, { icon: "coin", tone: "butter", cls: "price" })}
          ${hired ? tag(`Hired ${icon("check", "sm")}`, { tone: "sage", cls: "ok" }) : btn("Hire", { kind: "primary", data: { hire: "1" }, disabled: state.money < v.fee })}</div>
      </div>`;
  }
  const room = Math.max(0, state.flockCap - state.flock.length);
  const flock = state.flock.map((id) => state.sheep[id]!).map((s) => {
    const planned = state.plans[s.id] || Object.values(state.plans).includes(s.id);
    const entered = state.fair.entry === s.id;
    return `<li>${chip(state, s)} <span class="meta">${esc(ageWords(state, s))}${planned ? " · planned (would be cancelled)" : ""}${entered ? " · entered for the fair" : ""}</span>
      ${btn(`Sell · ${sheepValue(s, state.season)}`, { kind: "ghost", icon: "coin", cls: "small", data: { sell: s.id } })}</li>`;
  }).join("");
  return `<div class="panel-head">${head("store", "Market", 2)}<div class="tags">${tag(String(state.money), { icon: "coin", tone: "butter", title: "Your coins" })}${tag(`room for ${room}`, { icon: "fence", tone: room ? "sage" : "rose", title: "Room in your fields" })}</div></div>
    ${head("sheep", "For sale")}
    <div class="mcards">${stock.length ? stock.map((s) => marketCard(state, view, s)).join("") : `<p class="meta">Sold out. The trader comes back next season.</p>`}</div>
    ${visitor}
    ${upgradesHtml(state)}
    ${more("market-sell", `Sell a sheep · ${state.flock.length} of ${state.flockCap}`, `<ul class="sell-list">${flock}</ul>`, { open: lambRoom(state) < 1 })}`;
}

// ---- Vet --------------------------------------------------------------------

export function vetHtml(state: GameState, view: View): string {
  if (!has(state, "vet")) return `${head("vet", "Vet", 2)}<p>The vet's hut is shut for now. Hidden things will need testing soon enough.</p>`;
  const pool = state.flock.map((id) => state.sheep[id]!);
  const v = state.visitingRam && state.visitingRam.season === state.season ? state.sheep[state.visitingRam.id] : undefined;
  if (v) pool.push(v);
  const chosen = (view.tab && pool.find((s) => s.id === view.tab)) || (view.sheepId && pool.find((s) => s.id === view.sheepId)) || pool[0];
  const picker = pool.map((s) => `<button class="chip ${s.id === chosen?.id ? "on" : ""}" data-tab="${esc(s.id)}" role="tab" aria-selected="${s.id === chosen?.id}">${swatch(String(s.phenotype["colour"]))}<span class="nm">${esc(s.name)}</span></button>`).join("");
  if (!chosen) return `${head("vet", "Vet", 2)}<p>No sheep to test.</p>`;
  const facts = new Map(factsFor(state, chosen.id).map((f) => [f.locus, f]));
  const fvs = new Map(TEST_LOCI.map((l) => { let fv = { gainBits: 0, text: "" }; try { fv = forecastVet(state, chosen.id, l); } catch { /* skip */ } return [l, fv] as const; }));
  // One felt primary: the test that would teach you the most; the others are plain felt.
  const best = TEST_LOCI.filter((l) => !chosen.tested[l]).sort((a, b) => fvs.get(b)!.gainBits - fvs.get(a)!.gainBits)[0];
  const rows = TEST_LOCI.map((l) => {
    const fv = fvs.get(l)!;
    const fact = facts.get(l);
    const tested = !!chosen.tested[l];
    const val = Math.min(1, fv.gainBits * 0.64);
    return `<div class="vet-row ${tested ? "done" : ""}">
      <div class="v-label"><b>${esc(LOCUS_FRIENDLY[l] ?? l)}</b>${fact ? `<div class="meta">${dot(fact.confidence, fact.certain)} ${esc(fact.text.replace(/^[^:]+: /, ""))}</div>` : ""}</div>
      <div class="v-fore" title="${esc(fv.text)}">${learnMeter(val, learnWord(val), { label: "how much you'd learn", compact: true })}</div>
      <div class="v-act">${tested ? tag(`Tested ${icon("check", "sm")}`, { tone: "sage", cls: "ok" }) : btn(`Test · ${VET_FEE}`, { kind: l === best && fv.gainBits > 0.02 ? "primary" : "secondary", icon: "vet", data: { test: `${chosen.id}:${l}` }, disabled: state.money < VET_FEE, title: fv.text })}</div>
    </div>`;
  }).join("");
  return `<div class="panel-head">${head("vet", "Vet", 2)}<div class="tags">${tag(`${VET_FEE} a test`, { icon: "coin", tone: "butter" })}</div></div>
    <div class="chips" role="tablist" aria-label="Which sheep?">${picker}</div>
    <div class="vet-sheep">${portrait(view, chosen, "sm")}<div>${nm(esc(chosen.name))} ${sexMark(chosen)} <span class="meta">${esc(String(chosen.phenotype["colour"]))}, ${esc(String(chosen.phenotype["pattern"]))}, ${esc(String(chosen.phenotype["horns"]))}</span></div></div>
    <div class="vet-scale meta">${icon("lens", "inl")} How much a test would teach you: <span class="m-scale learn solo"><span class="w0">${LEARN_SCALE[0]}</span><span class="w2">${LEARN_SCALE[1]}</span></span></div>
    <div class="vet-rows">${rows}</div>`;
}

// ---- Fair -------------------------------------------------------------------

export function fairHtml(state: GameState, view: View): string {
  if (!has(state, "fair")) return `${head("rosette", "Village fair", 2)}<p>The fairground is quiet. The village fair will invite you once your wool is known.</p>`;
  const cat = state.fair.category;
  const when = state.fair.nextSeason - state.season;
  const eligible = state.flock.map((id) => state.sheep[id]!).filter((s) => isAdult(s, state.fair.nextSeason));
  const scored = eligible.map((s) => ({ s, f: forecastFair(state, s.id) })).sort((a, b) => b.f.pWin - a.f.pWin || b.f.pPlace - a.f.pPlace);
  const entry = state.fair.entry ? state.sheep[state.fair.entry] : undefined;
  const row = ({ s, f }: (typeof scored)[number], i: number) => {
    const on = entry?.id === s.id;
    const trait = traitWords(state, s).find((t) => (cat === "fine" ? t.label === "Wool" : cat === "heavy" ? t.label === "Fleece" : cat === "big" ? t.label === "Build" : false))?.text ?? `${s.phenotype["colour"]}${s.phenotype["pattern"] === "spotted" ? ", spotted" : ""}`;
    return `<div class="fair-row ${on ? "on" : ""}" title="${esc(f.text)}">
      ${portrait(view, s, "sm")}
      <div class="f-name">${chip(state, s)}<div class="meta">${esc(trait)}</div></div>
      <div class="f-odds"><div class="f-odd"><span class="f-lbl">${icon("rosette", "inl")} Win</span> ${pips(state, f.pWin, `First place: ${oddsLabel(f.pWin)}`, true)}</div><div class="f-odd"><span class="f-lbl">${icon("star", "inl")} Top 3</span> ${pips(state, f.pPlace, `Top three: ${oddsLabel(f.pPlace)}`, true)}</div></div>
      <div class="f-act">${on ? btn("Withdraw", { kind: "ghost", data: { enter: "none" } }) : btn("Enter", { kind: i === 0 && !entry ? "primary" : "secondary", data: { enter: s.id }, title: f.text })}</div>
    </div>`;
  };
  // The three best chances (and your entry) first; everyone else behind "more".
  const top = scored.filter((x, i) => i < 3 || x.s.id === entry?.id);
  const rest = scored.filter((x) => !top.includes(x));
  const list = top.map(row).join("") + (rest.length ? more("fair-rest", `Other sheep (${rest.length})`, `<div class="fair-rows">${rest.map((x, i) => row(x, i + 3)).join("")}</div>`) : "");
  const hist = state.fair.history.slice(-5).reverse().map((h) =>
    `<li><span class="when">${esc(seasonLabel(h.season))}</span> ${esc(FAIR_LABEL[h.category])}: ${h.place ? `${esc(h.entryName ?? "")} came ${h.place === 1 ? `first ${icon("rosette", "inl")}` : h.place === 2 ? "second" : h.place === 3 ? "third" : `${h.place}th`}${h.prize ? ` (+${h.prize} coins)` : ""}` : "no entry"}</li>`).join("");
  return `${head("rosette", "Village fair", 2)}
    <div class="fair-banner">${icon("rosette", "xl")}<div><div class="big">${esc(FAIR_LABEL[cat])}</div>
      <div class="tags">${tag(when <= 0 ? "judging this season" : `${esc(seasonLabel(state.fair.nextSeason))}`, { icon: "calendar", tone: "sky" })}${tag(FAIR_PRIZES.join(" · "), { icon: "coin", tone: "butter", title: "Prizes for first to third" })}</div></div>
      <div class="f-entry"><span class="lbl">Entry</span> ${entry ? chip(state, entry) : `<span class="meta">none yet</span>`}</div></div>
    ${list ? `<div class="fair-scale meta">${icon("dice", "inl")} Chances: ${oddsScale()}</div><div class="fair-rows">${list}</div>` : `<p class="meta">No sheep will be grown up in time.</p>`}
    ${hist ? more("fair-past", "Past fairs", `<ul class="plain">${hist}</ul>`) : ""}
    `;
}

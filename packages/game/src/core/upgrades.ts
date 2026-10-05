/** Farm improvements: one-time purchases with a clear effect, each shown with a forecast before buying. */
import { BENCH_CAP, BENCH_LABEL, BENCH_UPGRADES, STORE_CAP, STORE_CAP_PRESS, STORE_CAP_SHED, type BenchName, FEED_COST, FEED_GROWTH, FEED_MAX, PET_FEED, PET_NAME, PET_SEX, SHEARING_BONUS, UPGRADES, WOLF_MIN_ACT, type UpgradeDef } from "./config.js";
import { fondWoolMultiplier, fondnessOf, isPetId } from "./care.js";
import { woolIncome } from "./economy.js";
import { ownedDogs, predatorRisk } from "./events.js";
import { miceCost } from "./mice.js";
import { addLog, flockSheep, isAdult, yearOf } from "./state.js";
import type { DogId, GameState, UpgradeId } from "./types.js";
import { fractionWords } from "./words.js";

export function upgradeDef(id: string): UpgradeDef {
  const d = UPGRADES.find((u) => u.id === id);
  if (!d) throw new Error("There's no such improvement.");
  return d;
}

export function hasUpgrade(state: GameState, id: UpgradeId): boolean {
  return (state.upgrades ?? []).includes(id);
}

/** Coins per sheep for one season's feed. Hay gets dearer as the years go by. */
export function feedPerHead(season: number): number {
  return Math.min(FEED_MAX, FEED_COST + Math.floor(Math.max(0, yearOf(season) - 1) * FEED_GROWTH));
}

/** Is this improvement on offer at the market yet (its concept has arrived)? */
export function upgradeOffered(state: GameState, id: UpgradeId): boolean {
  return state.unlocks.includes(upgradeDef(id).unlock);
}

/** Extra flock room from improvements (added on top of each act's cap). */
export function upgradeCapBonus(state: GameState): number {
  return UPGRADES.filter((u) => hasUpgrade(state, u.id)).reduce((n, u) => n + u.cap, 0);
}

/** Why an improvement can't be bought right now (null when it can). */
export function upgradeBlocked(state: GameState, id: UpgradeId): string | null {
  const d = upgradeDef(id);
  if (hasUpgrade(state, id)) return "You already have this.";
  if (!state.unlocks.includes(d.unlock)) return "Not at the market yet.";
  if (state.act < d.minAct) return `Available from Act ${d.minAct + 1}.`;
  if (d.requires && !hasUpgrade(state, d.requires)) return `Needs ${upgradeDef(d.requires).name.toLowerCase()} first.`;
  if (state.money < d.price) return `Costs ${d.price} coins — you have ${state.money}.`;
  return null;
}

/** Coins this season's clip would fetch at today's prices (no booms), with each sheep's fondness. */
function clipValue(state: GameState, bonus: number): number {
  return flockSheep(state).filter((s) => isAdult(s, state.season)).reduce((t, s) => t + woolIncome(s, null, bonus * fondWoolMultiplier(fondnessOf(state, s.id))), 0);
}

export interface UpgradeForecast {
  text: string;
  /** Dogs: chance a fox / a wolf takes a lamb if it comes (and there are lambs), now and with this dog. */
  risk?: { fox: { now: number; with: number }; wolf: { now: number; with: number } };
  /** Cat: coins a mouse season would cost at today's flock, now and with the cat. */
  mice?: { now: number; with: number };
}

/** "never", "every time", "about one in four". */
export function chanceWords(p: number): string {
  if (p <= 0.001) return "never";
  if (p >= 0.999) return "every time";
  return fractionWords(p);
}

/** What a woolshed upgrade changes, in numbers of kilos or stitches (the benches' tier tables are in config). */
function craftUpgradeText(state: GameState, id: UpgradeId): string {
  const d = upgradeDef(id);
  if (id === "press") return `The wool store holds ${STORE_CAP_PRESS} fleeces instead of ${hasUpgrade(state, "shearing") ? STORE_CAP_SHED : STORE_CAP}, so you can keep wool back for the shed instead of selling it at once.`;
  const u = BENCH_UPGRADES.find((x) => x.id === id)!;
  const now = BENCH_CAP[u.bench][benchTierNow(state, u.bench)] ?? 0, next = BENCH_CAP[u.bench][u.tier]!;
  const unit = u.bench === "card" || u.bench === "spin" ? "kg" : "stitches' worth of work";
  return now > 0 ? `${d.blurb} (${BENCH_LABEL[u.bench]}: ${now} to ${next} ${unit} a season.)` : `${d.blurb} (${next} ${unit} a season.)`;
}
function benchTierNow(state: GameState, bench: BenchName): number {
  let t = bench === "weave" || bench === "felt" ? 0 : 1;
  for (const u of BENCH_UPGRADES) if (u.bench === bench && hasUpgrade(state, u.id)) t = Math.max(t, u.tier);
  return t;
}

/** What buying this improvement would change for this farm, in one or two plain sentences (plus odds for dogs). */
export function forecastUpgrade(state: GameState, id: UpgradeId): UpgradeForecast {
  const d = upgradeDef(id);
  if (d.group === "craft") return { text: craftUpgradeText(state, id) };
  const ev = state.pendingEvent;
  switch (id) {
    case "paddock":
    case "meadow": {
      const now = state.flockCap;
      return { text: `Your fields would hold ${now + d.cap} sheep instead of ${now}. More ewes can lamb each season — but every sheep eats ${feedPerHead(state.season)} coins of feed a season.` };
    }
    case "terrier":
    case "collie":
    case "maremma": {
      const dogs = ownedDogs(state);
      const plus: DogId[] = dogs.includes(id) ? dogs : [...dogs, id];
      const fox = { now: predatorRisk(state, "fox", dogs), with: predatorRisk(state, "fox", plus) };
      const wolf = { now: predatorRisk(state, "wolf", dogs), with: predatorRisk(state, "wolf", plus) };
      const lambs = flockSheep(state).filter((s) => !isAdult(s, state.season)).length;
      const lost = state.events.filter((e) => (e.kind === "fox" || e.kind === "wolf") && !e.saved && e.sheep).length;
      const soon = ev?.kind === "fox" ? " A fox has been seen — it comes this winter." : ev?.kind === "wolf" ? " A wolf is coming this winter." : "";
      const past = lost ? ` Foxes and wolves have taken ${lost} lamb${lost === 1 ? "" : "s"} so far.` : "";
      const wolves = state.act >= WOLF_MIN_ACT || ev?.kind === "wolf" ? "" : " (Wolves only come in later years.)";
      const others = dogs.filter((x) => x !== id);
      const pack = others.length ? ` ${PET_NAME[id]} would keep watch with ${others.map((x) => PET_NAME[x]).join(" and ")}.` : "";
      const foxLine = fox.now === 0 && fox.with === 0
        ? "A bold sheep already keeps foxes off."
        : `If a fox comes, it gets a lamb ${chanceWords(fox.now)} now; with ${PET_NAME[id]}, ${chanceWords(fox.with)}.`;
      const wolfLine = wolf.with >= wolf.now - 0.001
        ? ` ${PET_NAME[id]} is no help against a wolf.`
        : ` A wolf: ${chanceWords(wolf.now)} now, ${chanceWords(wolf.with)} with ${PET_NAME[id]}.`;
      const eats = ` ${PET_SEX[id] === "she" ? "She" : "He"} eats ${PET_FEED[id]} coin${PET_FEED[id] === 1 ? "" : "s"} of food a season.`;
      return {
        text: `${foxLine}${wolfLine}${wolves}${pack} You have ${lambs} lamb${lambs === 1 ? "" : "s"} in the field now.${past}${soon}${eats}`,
        risk: { fox, wolf },
      };
    }
    case "cat": {
      const adults = flockSheep(state).filter((s) => isAdult(s, state.season));
      const shed = hasUpgrade(state, "shearing") ? SHEARING_BONUS : 1;
      const clip = clipValue(state, shed);
      const eaters = state.flock.length;
      const now = miceCost(state, clip, eaters, false);
      const cat = miceCost(state, clip, eaters, true);
      const nowT = now.wool + now.feed, withT = cat.wool + cat.feed;
      const soon = state.mice === state.season + 1 || state.mice === state.season ? " Mice are coming next season." : "";
      const flockWord = adults.length ? `With your flock today` : "Even before you have wool to spoil";
      return {
        text: `${flockWord}, a mouse season would cost about ${nowT} coins of wool and hay; with ${PET_NAME.cat}, about ${withT}.${soon} He eats ${PET_FEED.cat} coin of food a season.`,
        mice: { now: nowT, with: withT },
      };
    }
    case "barn": {
      const ill = state.events.filter((e) => e.kind === "hardWinter" && e.sheep).length;
      const soon = ev?.kind === "hardWinter" ? " A hard winter is on its way." : "";
      const past = ill ? ` Hard winters have laid up ${ill} sheep so far, each missing a season of lambing.` : "";
      return { text: `Nobody would fall ill in a hard winter, so every ewe could still lamb in spring.${past}${soon}` };
    }
    case "drumCarder": case "millShare": case "wheel": case "wheel2": case "circle": case "knitHall":
    case "tableLoom": case "floorLoom": case "feltTable": case "feltSink": case "press":
      return { text: craftUpgradeText(state, id) };
    case "shearing": {
      const base = clipValue(state, 1);
      const gain = clipValue(state, SHEARING_BONUS) - base;
      const payback = gain > 0 ? Math.ceil(d.price / gain) : null;
      return {
        text: gain > 0
          ? `Today's clip would fetch about ${base + gain} coins instead of ${base} — about +${gain} a season, so it pays for itself in roughly ${payback} season${payback === 1 ? "" : "s"}.`
          : "Wool would fetch a quarter more — once you have grown sheep to shear.",
      };
    }
  }
}

/** Buy an improvement. Throws a player-readable message if it can't be bought. */
export function buyUpgrade(state: GameState, id: string): void {
  const d = upgradeDef(id);
  const blocked = upgradeBlocked(state, d.id);
  if (blocked) throw new Error(blocked);
  state.money -= d.price;
  state.upgrades = [...(state.upgrades ?? []), d.id];
  state.flockCap += d.cap;
  if (isPetId(d.id)) {
    // A new dog or cat is new to you too: it starts a little wary.
    if (!state.care) state.care = {};
    delete state.care[d.id];
  }
  addLog(state, `Farm improvement: ${isPetId(d.id) ? d.name : d.name.toLowerCase()}, for ${d.price} coins.`);
}

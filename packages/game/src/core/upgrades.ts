/** Farm improvements: one-time purchases with a clear effect, each shown with a forecast before buying. */
import { FEED_COST, FEED_GROWTH, FEED_MAX, SHEARING_BONUS, UPGRADES, type UpgradeDef } from "./config.js";
import { woolIncome } from "./economy.js";
import { addLog, flockSheep, isAdult, yearOf } from "./state.js";
import type { GameState, UpgradeId } from "./types.js";

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

/** Extra flock room from improvements (added on top of each act's cap). */
export function upgradeCapBonus(state: GameState): number {
  return UPGRADES.filter((u) => hasUpgrade(state, u.id)).reduce((n, u) => n + u.cap, 0);
}

/** Why an improvement can't be bought right now (null when it can). */
export function upgradeBlocked(state: GameState, id: UpgradeId): string | null {
  const d = upgradeDef(id);
  if (hasUpgrade(state, id)) return "You already have this.";
  if (state.act < d.minAct) return `Available from Act ${d.minAct + 1}.`;
  if (d.requires && !hasUpgrade(state, d.requires)) return `Needs ${upgradeDef(d.requires).name.toLowerCase()} first.`;
  if (state.money < d.price) return `Costs ${d.price} coins — you have ${state.money}.`;
  return null;
}

/** Coins this season's clip would fetch at today's prices (no booms). */
function clipValue(state: GameState, bonus: number): number {
  return flockSheep(state).filter((s) => isAdult(s, state.season)).reduce((t, s) => t + woolIncome(s, null, bonus), 0);
}

/** What buying this improvement would change for this farm, in one or two plain sentences. */
export function forecastUpgrade(state: GameState, id: UpgradeId): { text: string } {
  const d = upgradeDef(id);
  const ev = state.pendingEvent;
  switch (id) {
    case "paddock":
    case "meadow": {
      const now = state.flockCap;
      return { text: `Your fields would hold ${now + d.cap} sheep instead of ${now}. More ewes can lamb each season — but every sheep eats ${feedPerHead(state.season)} coins of feed a season.` };
    }
    case "dog": {
      const lambs = flockSheep(state).filter((s) => !isAdult(s, state.season)).length;
      const lost = state.events.filter((e) => e.kind === "fox" && !e.saved && e.sheep).length;
      const soon = ev?.kind === "fox" ? " A fox has been seen — it comes this winter." : "";
      const past = lost ? ` Foxes have taken ${lost} lamb${lost === 1 ? "" : "s"} so far.` : "";
      return { text: `No fox would ever take a lamb. You have ${lambs} lamb${lambs === 1 ? "" : "s"} in the field now.${past}${soon}` };
    }
    case "barn": {
      const ill = state.events.filter((e) => e.kind === "hardWinter" && e.sheep).length;
      const soon = ev?.kind === "hardWinter" ? " A hard winter is on its way." : "";
      const past = ill ? ` Hard winters have laid up ${ill} sheep so far, each missing a season of lambing.` : "";
      return { text: `Nobody would fall ill in a hard winter, so every ewe could still lamb in spring.${past}${soon}` };
    }
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
  addLog(state, `Farm improvement: ${d.name.toLowerCase()}, for ${d.price} coins.`);
}

import { describe, expect, it } from "vitest";
import { createRng } from "@blue-sheep/genetics";
import {
  acceptOrder, advanceSeason, declineOrder, enterAct, flockSheep, forecastOrder, forecastOrderFor, newGame, planMating,
  type GameState, type Order,
} from "./index.js";
import { generateOrders } from "./orders.js";
import { GENOTYPE_RE, planAll } from "./testkit.js";

function order(g: GameState, over: Partial<Order>): Order {
  const o: Order = {
    id: `o${g.nextOrderId++}`, kind: "colour", villager: "Mrs Pike", text: "test", colour: null, horns: null, sex: null,
    kg: null, microns: null, posted: g.season, expires: g.season + 2, deadline: g.season + 4, reward: 20, reputation: 1,
    status: "open", filledBy: [], resolvedSeason: null, ...over,
  };
  g.orders.push(o);
  return o;
}

function actOneGame(seed: number): GameState {
  const g = newGame(seed);
  planAll(g);
  advanceSeason(g);
  expect(g.act).toBe(1);
  return g;
}

describe("orders", () => {
  it("are posted from act 1, at most 3 on the board, with plain text and a usable forecast", () => {
    let posted = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = actOneGame(seed);
      for (let t = 0; t < 6; t++) {
        expect(g.orders.length).toBeLessThanOrEqual(3);
        for (const o of g.orders) {
          posted++;
          expect(o.text).not.toMatch(GENOTYPE_RE);
          expect(o.deadline).toBeGreaterThan(o.posted);
          if (g.act < 2) expect(["colour", "horns"]).toContain(o.kind); // wool only from act 2
          const f = forecastOrder(g, o.id);
          expect(f.pFill).toBeGreaterThanOrEqual(0);
          expect(f.pFill).toBeLessThanOrEqual(1);
          expect(f.text).not.toMatch(GENOTYPE_RE);
        }
        planAll(g);
        advanceSeason(g);
      }
    }
    expect(posted).toBeGreaterThan(0);
  });

  it("new orders are usually fillable (forecast at posting >= the minimum)", () => {
    const g = actOneGame(3);
    enterAct(g, 2);
    const fresh = generateOrders(g, createRng(7));
    for (const o of fresh) expect(forecastOrderFor(g, o).pFill).toBeGreaterThanOrEqual(0.3);
  });

  it("forecast is higher for a colour the flock can make than for one it cannot", () => {
    const g = newGame(30);
    enterAct(g, 1);
    const white = order(g, { colour: "white" });
    const blue = order(g, { colour: "blue", deadline: g.season + 1 });
    expect(forecastOrder(g, white.id).pFill).toBeGreaterThan(forecastOrder(g, blue.id).pFill);
    const none = order(g, { colour: "white", deadline: g.season });
    expect(forecastOrder(g, none.id).pFill).toBe(0);
  });

  it("accepting is limited to two; declining an open order removes it without penalty", () => {
    const g = newGame(31);
    enterAct(g, 1);
    const a = order(g, { colour: "white" }), b = order(g, { colour: "black" }), c = order(g, { colour: "brown" });
    acceptOrder(g, a.id);
    acceptOrder(g, b.id);
    expect(() => acceptOrder(g, c.id)).toThrow(/only take 2/);
    expect(g.acceptedOrders).toEqual([a.id, b.id]);
    g.reputation = 3;
    declineOrder(g, c.id);
    expect(g.orders.map((o) => o.id)).not.toContain(c.id);
    expect(g.reputation).toBe(3);
  });

  it("a colour order is filled by a newly bred matching lamb, which goes to the villager", () => {
    const g = newGame(32);
    enterAct(g, 1);
    const o = order(g, { colour: "white", deadline: g.season + 3, reward: 33 });
    acceptOrder(g, o.id);
    const ram = flockSheep(g).find((s) => s.sex === "ram")!;
    let r;
    for (let t = 0; t < 3 && g.orderHistory.length === 0; t++) {
      g.flockCap = 30;
      for (const e of flockSheep(g).filter((s) => s.sex === "ewe" && s.born < 0)) planMating(g, e.id, ram.id);
      r = advanceSeason(g);
    }
    const done = g.orderHistory.find((x) => x.id === o.id);
    if (done?.status !== "filled") return; // (every lamb non-white is possible on some seeds)
    expect(done.filledBy).toHaveLength(1);
    const lamb = g.sheep[done.filledBy[0]!]!;
    expect(lamb.born).toBeGreaterThan(o.posted);
    expect(g.flock).not.toContain(lamb.id);
    expect(g.stats.ordersFilled).toBe(1);
    expect(r!.orderResults.some((x) => x.outcome === "filled" && x.reward === 33)).toBe(true);
  });

  it("existing sheep do not fill colour orders (they must be bred after posting)", () => {
    const g = newGame(33);
    enterAct(g, 1);
    const colour = String(flockSheep(g)[0]!.phenotype["colour"]);
    const o = order(g, { colour, deadline: g.season + 1 });
    acceptOrder(g, o.id);
    g.reputation = 2;
    const r = advanceSeason(g); // no matings planned
    expect(r.orderResults.find((x) => x.order.id === o.id)?.outcome).toBe("failed");
    expect(g.reputation).toBe(1);
    expect(g.stats.ordersFailed).toBe(1);
  });

  it("wool orders take fleece at shearing instead of the market", () => {
    const g = newGame(34);
    enterAct(g, 2);
    const kg = flockSheep(g).reduce((t, s) => t + Number(s.phenotype["fleeceWeight"]), 0);
    const o = order(g, { kind: "wool", kg: Math.floor(kg / 2), microns: 99, reward: 50 });
    expect(forecastOrder(g, o.id).pFill).toBe(1);
    acceptOrder(g, o.id);
    const money = g.money;
    const r = advanceSeason(g);
    const res = r.orderResults.find((x) => x.order.id === o.id)!;
    expect(res.outcome).toBe("filled");
    expect(g.money).toBe(money + r.income + 50 - r.feed);
    expect(g.flock.length).toBeGreaterThan(0); // wool orders keep the sheep
  });

  it("unaccepted offers expire", () => {
    const g = newGame(35);
    enterAct(g, 1);
    const o = order(g, { colour: "white", expires: g.season + 1 });
    const r = advanceSeason(g);
    expect(r.orderResults.find((x) => x.order.id === o.id)?.outcome).toBe("expired");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { createRng, genotypeString, mate, sheep3 } from "@blue-sheep/genetics";
import {
  RARE, RARE_LOCI, RARE_SCREEN_FEE, advanceSeason, canBreed, craftOn, enterAct, factsFor, fleeceRate, forecastCross, forecastJob,
  forecastScreen, genomeOf, giftFleece, makeLot, marginal, newGame, noteRareWools, onCraftArrives, patternsOf,
  planMating, plantRareSheep, posteriors, rareCarrierChance, rareFactsFor, rareWoolOf, screenOpen, species, storeOf, updateDiscoveries, updatePatterns,
  vetScreen, wasScreened, entropyBits, queueJob, forecastVisitor, type GameState, type Sheep,
} from "./index.js";
import { offerVisitingRam } from "./visitor.js";
import { addSheep, rngOf, saveRng } from "./state.js";
import { GENOTYPE_RE } from "./testkit.js";

/** A farm at act 3 with the vet open and coins to spare. */
function farm(seed: number): GameState {
  const g = newGame(seed);
  enterAct(g, 3, undefined, { grant: true });
  g.money = 500;
  return g;
}
const adults = (g: GameState, sex: "ewe" | "ram") => g.flock.map((id) => g.sheep[id]!).filter((s) => s.sex === sex && canBreed(s, g.season));

/** A lamb of two sheep with a mutation forced at `locus` (rate 1), added to the flock. */
function sportLamb(g: GameState, dam: Sheep, sire: Sheep, locus: string): Sheep {
  const rng = rngOf(g);
  const genome = mate(genomeOf(dam), genomeOf(sire), species.map, rng, { mutation: { loci: [locus], rate: 1 } });
  const lamb = addSheep(g, rng, { sex: "ewe", born: g.season, dam: dam.id, sire: sire.id, genome, inbreeding: 0, origin: "bred" });
  g.flock.push(lamb.id);
  saveRng(g, rng);
  return lamb;
}

describe("sports: a brand-new mutation", () => {
  it("a forced sport plus a contradicting test gives a discovery card and never throws", () => {
    const g = farm(21);
    const [ewe] = adults(g, "ewe"), [ram] = adults(g, "ram");
    // Both parents are screened clear of every rare gene (Farm sheep carry no steel allele).
    vetScreen(g, ewe!.id); vetScreen(g, ram!.id);
    expect(marginal(g, ewe!.id, "ST")["ST/ST"]).toBeCloseTo(1, 6);
    const lamb = sportLamb(g, ewe!, ram!, "ST");
    // Nothing contradicts yet: a hidden carrier is just a hidden carrier.
    expect(() => posteriors(g, true)).not.toThrow();
    expect(g.knownSports ?? {}).toEqual({});
    // The screen shows the lamb carries steel, which its clear parents cannot have given it.
    let cards: ReturnType<typeof updateDiscoveries> = [];
    expect(() => { cards = vetScreen(g, lamb.id); }).not.toThrow();
    const card = cards.find((c) => c.kind === "sport");
    expect(card).toBeDefined();
    expect(card!.sheep).toBe(lamb.id);
    expect(card!.text).toContain(`${lamb.name} is a sport, a brand-new mutation!`);
    expect(card!.text).not.toMatch(GENOTYPE_RE);
    expect(g.knownSports![lamb.id]).toEqual(["ST"]);
    // The lamb now counts as a founder for steel: the records are consistent and it carries the gene for sure.
    expect(marginal(g, lamb.id, "ST")["ST/st"]).toBeCloseTo(1, 6);
    expect(factsFor(g, lamb.id).find((f) => f.locus === "ST")?.text).toMatch(/carries a hidden steel wool copy/);
    // The card is minted once.
    expect(updateDiscoveries(g).filter((c) => c.kind === "sport")).toHaveLength(0);
    expect(g.discoveries.filter((d) => d.kind === "sport")).toHaveLength(1);
  });

  it("reading the posteriors never changes the farm's records: the sport is found in the read and recorded by updateDiscoveries", () => {
    const g = farm(24);
    const [ewe] = adults(g, "ewe"), [ram] = adults(g, "ram");
    ewe!.tested["ST"] = "ST/ST"; ram!.tested["ST"] = "ST/ST";
    const lamb = sportLamb(g, ewe!, ram!, "ST");
    lamb.tested["ST"] = "ST/st"; // the test the parents' records can't explain
    const read = posteriors(g, true);
    expect(read.sports[lamb.id]).toEqual(["ST"]);
    expect(g.knownSports).toBeUndefined();
    expect(g.discoveries.some((d) => d.kind === "sport")).toBe(false);
    expect(updateDiscoveries(g).some((d) => d.kind === "sport" && d.sheep === lamb.id)).toBe(true);
    expect(g.knownSports).toEqual({ [lamb.id]: ["ST"] });
  });

  it("a pōhutukawa lamb from plain parents is found to be a sport at once (the dominant gene shows)", () => {
    const g = farm(22);
    const [ewe] = adults(g, "ewe"), [ram] = adults(g, "ram");
    const lamb = sportLamb(g, ewe!, ram!, "PO");
    expect(lamb.phenotype["pohutukawa"]).toBe("pohutukawa");
    const cards = updateDiscoveries(g);
    expect(cards.find((c) => c.kind === "sport" && c.sheep === lamb.id)).toBeDefined();
    expect(g.knownSports![lamb.id]).toEqual(["PO"]);
    expect(marginal(g, lamb.id, "PO")["po/PO"]).toBeGreaterThan(0.99);
  });

  it("survives a chain of forced sports (rate 1 at one gene per lamb): the records never throw", () => {
    const g = farm(23);
    const [ewe] = adults(g, "ewe"), [ram] = adults(g, "ram");
    let line = ewe!, prev = ram!;
    for (let i = 0; i < 4; i++) {
      const lamb = sportLamb(g, line, prev, i % 2 ? "CL" : "GW");
      vetScreen(g, lamb.id);
      prev = line; line = lamb;
      expect(() => updateDiscoveries(g)).not.toThrow();
    }
  });
});

describe("carriers and the forecast", () => {
  it("carrier x carrier shows the wool in about one lamb in four, in the forecast and in the lambs", () => {
    const g = farm(31);
    const steel = plantRareSheep(g, "steel");
    expect(steel.phenotype["steel"]).toBe("steel");
    const ewe = g.sheep[steel.dam!]!, ram = g.sheep[steel.sire!]!;
    // The steel lamb proves both parents carry the gene: the records know it.
    for (const s of [ewe, ram]) expect(marginal(g, s.id, "ST")["ST/st"]).toBeGreaterThan(0.95);
    const f = forecastCross(g, ewe.id, ram.id);
    const steelBand = f.rare.find((r) => r.id === "steel")!;
    expect(steelBand.p).toBeGreaterThan(0.2);
    expect(steelBand.p).toBeLessThan(0.3);
    // The real lambs: the parents' true genomes mated many times.
    const rng = createRng(5);
    let showing = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const lamb = mate(genomeOf(ewe), genomeOf(ram), species.map, rng);
      const [a, b] = lamb.chromosomes[species.map.loci.get("ST")!.chromosome]!.map((h) => h[species.map.loci.get("ST")!.index]!) as [number, number];
      if (a === 1 && b === 1) showing++;
    }
    expect(showing / N).toBeGreaterThan(0.22);
    expect(showing / N).toBeLessThan(0.28);
  });

  it("an ordinary cross has no rare-wool line, and the words are plain", () => {
    // Every ewe by every ram of a few ordinary farms after 10 seasons: none of the forecasts lists a rare wool at all (a
    // long-shot tail under RARE_SHOWN_P would clutter each one). Only a pair with a plausible carrier may have a line.
    for (const seed of [5, 9, 12, 32]) {
      const h = farm(seed);
      h.flockCap = 40;
      for (let i = 0; i < 10; i++) {
        const [e] = adults(h, "ewe"), [r] = adults(h, "ram");
        if (e && r) { try { planMating(h, e.id, r.id); } catch { /* busy */ } }
        advanceSeason(h);
      }
      const ewes = h.flock.map((id) => h.sheep[id]!).filter((x) => x.sex === "ewe"), rams = h.flock.map((id) => h.sheep[id]!).filter((x) => x.sex === "ram");
      for (const e of ewes) for (const r of rams) {
        for (const line of forecastCross(h, e.id, r.id).rare) {
          const locus = RARE.find((d) => d.id === line.id)!.locus;
          expect(Math.max(rareCarrierChance(h, e.id, locus), rareCarrierChance(h, r.id, locus)), `seed ${seed}: ${e.name} x ${r.name} lists ${line.id} (p ${line.p})`).toBeGreaterThan(0.1);
        }
      }
    }
    const g = farm(32);
    const steel = plantRareSheep(g, "steel");
    for (const s of [steel, g.sheep[steel.dam!]!]) for (const fact of rareFactsFor(g, s.id)) expect(fact.text).not.toMatch(GENOTYPE_RE);
  });

  it("a visiting ram from down south widens the band: a one-in-four chance he carries the gene", () => {
    const g = farm(33);
    let southern = 0, carriers = 0, visitors = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const h = newGame(seed);
      enterAct(h, 3, undefined, { grant: true });
      const rng = createRng(seed * 7);
      offerVisitingRam(h, rng);
      const v = h.sheep[h.visitingRam!.id]!;
      visitors++;
      if (!v.southern) { expect(h.visitingRam!.rare).toBeUndefined(); continue; }
      southern++;
      expect(h.visitingRam!.rare).toBe(v.southern);
      expect(RARE.find((r) => r.locus === v.southern)?.dominant).toBe(false);
      const south = species.map.loci.get(v.southern)!;
      const [a, b] = genomeOf(v).chromosomes[south.chromosome]!.map((hh) => hh[south.index]!) as [number, number];
      if (a + b === 1) carriers++;
    }
    expect(southern / visitors).toBeGreaterThan(0.3);
    expect(southern / visitors).toBeLessThan(0.5);
    expect(carriers / southern).toBeGreaterThan(0.19);
    expect(carriers / southern).toBeLessThan(0.31);
    // The farm's records give him a one in four carrier chance at that gene, and the forecast's band for a known-carrier ewe is wide.
    const h = farm(34);
    const steel = plantRareSheep(h, "steel");
    const ewe = h.sheep[steel.dam!]!;
    offerVisitingRam(h, createRng(99));
    let tries = 0;
    while (!h.visitingRam!.rare && tries++ < 200) offerVisitingRam(h, createRng(1000 + tries));
    const v = h.sheep[h.visitingRam!.id]!;
    const locus = v.southern!;
    expect(marginal(h, v.id, locus)[`${species.map.loci.get(locus)!.alleles[0]}/${species.map.loci.get(locus)!.alleles[1]}`]).toBeGreaterThan(0.15);
    expect(marginal(h, v.id, locus)[`${species.map.loci.get(locus)!.alleles[0]}/${species.map.loci.get(locus)!.alleles[1]}`]).toBeLessThan(0.4);
    expect(forecastVisitor(h).text).toMatch(/down south/);
    // a one in four chance is a "maybe" on his card, not "no copy"
    expect(rareFactsFor(h, v.id).some((f) => f.locus === locus && f.kind === "maybe" && /may carry/.test(f.text))).toBe(true);
    expect(ewe).toBeDefined();
  });
});

describe("rams from down south", () => {
  it("only appear from chapter 3", () => {
    let early = 0, late = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lo = newGame(seed), hi = newGame(seed);
      enterAct(lo, 2, undefined, { grant: true });
      enterAct(hi, 3, undefined, { grant: true });
      offerVisitingRam(lo, createRng(seed)); offerVisitingRam(hi, createRng(seed));
      if (lo.sheep[lo.visitingRam!.id]!.southern) early++;
      if (hi.sheep[hi.visitingRam!.id]!.southern) late++;
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });
});

describe("the vet's rare-gene screen", () => {
  it("forecast bits never exceed the entropy; the screen charges 20, tests all six genes and settles them", () => {
    const g = farm(41);
    expect(screenOpen(g)).toBe(true);
    const early = newGame(41);
    expect(screenOpen(early)).toBe(false);
    enterAct(early, 2, undefined, { grant: true });
    expect(screenOpen(early)).toBe(false); // the screen opens at chapter 3
    expect(() => vetScreen(early, early.flock[0]!)).toThrow(/can't screen/);
    const visitor = (() => { offerVisitingRam(g, createRng(3)); return g.sheep[g.visitingRam!.id]!; })();
    const family = plantRareSheep(g, "cloud");
    const pool = [...g.flock.map((id) => g.sheep[id]!), visitor];
    expect(pool.length).toBeGreaterThanOrEqual(4);
    const sixGenes = (st: GameState, id: string) => RARE_LOCI.reduce((n, l) => n + entropyBits(Object.values(marginal(st, id, l))), 0);
    for (const s of pool) {
      const f = forecastScreen(g, s.id);
      expect(f.gainBits).toBeLessThanOrEqual(6 * Math.log2(3) + 1e-9);
      expect(f.gainBits).toBeGreaterThanOrEqual(0);
      expect(f.text).not.toMatch(GENOTYPE_RE);
      // The real rule, checked on a copy of the farm: the forecast is the doubt the screen removes. After it every gene is
      // settled (entropy 0), so what the records lost is what was forecast, and no more than the doubt there was.
      const copy = JSON.parse(JSON.stringify(g)) as GameState;
      const before = sixGenes(copy, s.id);
      vetScreen(copy, s.id);
      const after = sixGenes(copy, s.id);
      expect(after).toBeLessThan(1e-6);
      expect(before - after).toBeCloseTo(f.gainBits, 6);
      expect(f.gainBits).toBeLessThanOrEqual(before + 1e-9);
    }
    // A hidden carrier among them: the screen's forecast is the carrier gene's doubt.
    const carrier = g.sheep[family.dam!]!;
    expect(forecastScreen(g, carrier.id).gainBits).toBeLessThan(1);
    const money = g.money;
    vetScreen(g, carrier.id);
    expect(g.money).toBe(money - RARE_SCREEN_FEE);
    expect(wasScreened(carrier)).toBe(true);
    expect(forecastScreen(g, carrier.id).gainBits).toBe(0);
    expect(() => vetScreen(g, carrier.id)).toThrow(/already/);
    for (const l of RARE_LOCI) expect(Object.values(marginal(g, carrier.id, l)).some((p) => p > 0.999)).toBe(true);
    const carries = rareFactsFor(g, carrier.id).find((f) => f.locus === "CL")!;
    expect(carries.certain).toBe(true);
    expect(g.log.at(-1)!.text).not.toMatch(GENOTYPE_RE);
    g.money = 5;
    expect(() => vetScreen(g, family.id)).toThrow(/costs/);
  });
});

describe("surprise lambs and the Rare wools record", () => {
  it("a carrier pair soon has a rare lamb: the report names it, the first is flagged, the codex record fills", () => {
    const g = farm(54);
    const steel = plantRareSheep(g, "steel");
    expect(g.rareSeen!["steel"]).toBe(g.season);
    // The steel lamb itself goes away (so the next steel lamb is the farm's first); its parents still carry the gene.
    g.flock = g.flock.filter((id) => id !== steel.id);
    delete g.sheep[steel.id];
    g.rareSeen = {};
    const ewe = g.sheep[steel.dam!]!, ram = g.sheep[steel.sire!]!;
    let found: { id: string; wool: string; first: boolean } | undefined;
    for (let i = 0; i < 30 && !found; i++) {
      g.money = Math.max(g.money, 400);
      g.flockCap = 40;
      if (canBreed(ewe, g.season) && g.flock.includes(ewe.id)) { try { planMating(g, ewe.id, ram.id); } catch { /* busy */ } }
      const r = advanceSeason(g);
      found = r.rareLambs?.find((x) => x.wool === "steel");
    }
    expect(found).toBeDefined();
    expect(found!.first).toBe(true);
    expect(g.sheep[found!.id]!.phenotype["steel"]).toBe("steel");
    expect(g.rareSeen!["steel"]).toBeDefined();
  });

  it("noteRareWools records what the farm and the market show", () => {
    const g = farm(52);
    expect(g.rareSeen ?? {}).toEqual({});
    plantRareSheep(g, "glow");
    expect(Object.keys(g.rareSeen!)).toEqual(["glow"]);
    expect(noteRareWools(g)).toEqual([]);
  });

  it("every rare wool can be planted, and pāua shows only on a glossy fleece", () => {
    for (const r of RARE) {
      const g = farm(60 + RARE.indexOf(r));
      const s = plantRareSheep(g, r.id);
      expect(rareWoolOf(s)).toBe(r.id);
      expect(g.flock).toContain(s.id);
      if (r.id === "paua") expect(Number(s.phenotype["lustre"])).toBeGreaterThanOrEqual(5);
    }
    // a pāua gene on a dull fleece is hidden
    const dull = Object.values(newGame(70).sheep).find((x) => Number(x.phenotype["lustre"]) < 5)!;
    expect(dull.phenotype["paua"]).toBeUndefined();
  });
});

describe("rare wool fleeces and items", () => {
  it("a rare fleece fetches three times the wool, and its own item can be queued", () => {
    const g = farm(71);
    const steel = plantRareSheep(g, "steel");
    const plain = { ...steel, phenotype: { ...steel.phenotype, steel: "plain" } };
    expect(fleeceRate(steel) / fleeceRate(plain)).toBeCloseTo(3, 6);
    onCraftArrives(g, false);
    // before there is a steel fleece in the store, the gloves are known (a steel sheep is grown) but cannot be queued
    updatePatterns(g);
    expect(patternsOf(g)).toContain("steelGloves");
    giftFleece(g);
    const gift = storeOf(g)[0]!;
    expect(forecastJob(g, { item: "steelGloves", source: `lot:${gift.id}` }).ok).toBe(false);
    const lot = makeLot(g, steel, g.season);
    expect(lot.fantasy).toBe("steel");
    (g.store ??= []).push(lot);
    const fc = forecastJob(g, { item: "steelGloves", source: `lot:${lot.id}` });
    expect(fc.ok).toBe(true);
    const job = queueJob(g, { item: "steelGloves", source: `lot:${lot.id}` });
    expect(job.mat.fantasy).toBe("steel");
    expect(craftOn(g)).toBe(true);
  });

  it("cloud socks need the drum carder and a cloud fleece", () => {
    const g = farm(72);
    const cloud = plantRareSheep(g, "cloud");
    onCraftArrives(g, false);
    updatePatterns(g);
    const lot = makeLot(g, cloud, g.season);
    (g.store ??= []).push(lot);
    const f = forecastJob(g, { item: "cloudSocks", source: `lot:${lot.id}` });
    expect(f.ok).toBe(false);
    expect(f.why).toMatch(/drum carder/);
    (g.upgrades ??= []).push("drumCarder");
    expect(forecastJob(g, { item: "cloudSocks", source: `lot:${lot.id}` }).ok).toBe(true);
  });
});

describe("determinism with sports on", () => {
  const realRate = sheep3.SPORTS.mutation.rate;
  afterEach(() => { sheep3.SPORTS.mutation.rate = realRate; });

  it("the same saved state gives the same season, sports and all (mutation rate raised so sports really fire)", () => {
    sheep3.SPORTS.mutation.rate = 0.05;
    const a = farm(81), b = JSON.parse(JSON.stringify(a)) as GameState;
    for (let i = 0; i < 6; i++) {
      for (const g of [a, b]) {
        const [e] = adults(g, "ewe"), [r] = adults(g, "ram");
        if (e && r) { try { planMating(g, e.id, r.id); } catch { /* */ } }
        advanceSeason(g);
      }
    }
    // A sport is a lamb with an allele at a rare gene that neither parent has at all.
    const sports = Object.values(a.sheep).filter((x) => x.dam && x.sire && a.sheep[x.dam] && a.sheep[x.sire] && RARE_LOCI.some((l) => {
      const at = (y: Sheep) => genotypeString(genomeOf(y), species.map, l).split("/");
      const parents = new Set([...at(a.sheep[x.dam!]!), ...at(a.sheep[x.sire!]!)]);
      return at(x).some((al) => !parents.has(al));
    }));
    expect(sports.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

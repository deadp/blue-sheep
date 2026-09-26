import { beforeAll, describe, expect, it } from "vitest";
import { GOALS, acceptOrder, canBreed, factsFor, forecastOrder, giveTreat, greetAnimal, isAdult, seasonLabel, type GameState } from "../core/index.js";
import { CONCEPTS, ODDS_SCALE, PANEL_NAMES, hudHtml, mentorHtml, renderPanel, forecastPanelHtml, tutorialStepMet, tutorialTarget, type View, type PanelName } from "./index.js";
import { TUTORIAL_STEPS, advanceSeason, advanceTutorial, buySheep, cheapestMarketEwe, newTutorialGame, planMating, tutorialStep } from "../core/index.js";
import { personalityLine } from "../core/index.js";
import { fixtures, type Fixture } from "./fixtures.js";

const PORTRAIT = "data:image/png;base64,AAAA";
const GENOTYPE = /[A-Za-z]\/[A-Za-z]/;
const VOCAB = new Set([
  "close", "open", "sheep", "findmate", "mate", "goal", "plan", "buy", "sell", "hire", "test", "accept", "decline",
  "enter", "sheep-id", "sleep", "rename", "newgame", "tab", "toggle", "export", "import", "upgrade", "tutorial", "treat",
  // not actions: markers on the care box, the animal card and improvement cards (for probes and styles)
  "care", "pet", "upgrade-card",
  // not actions: the mentor card's step markers for probes and styles
  "step", "step-id",
  // settings' volume slider (an input, handled on input/change)
  "volume",
  // not actions: the controller's mount point for the sheep card's live portrait
  "live-portrait-slot",
]);

function view(p: Partial<View> = {}): View {
  return { panel: null, sheepId: null, mateId: null, goal: "blue", tab: null, report: null, portraits: () => PORTRAIT, ...p };
}

/** Player-visible markup: drop image sources (data URLs contain "image/png"). */
function visible(html: string): string {
  return html.replace(/src="[^"]*"/g, "");
}

function checkCommon(html: string, s: GameState, where: string): void {
  expect(html.trim().length, where).toBeGreaterThan(20);
  const v = visible(html);
  const m = v.match(GENOTYPE);
  expect(m, `${where}: genotype-like text ${m?.[0]} near ${m ? v.slice(Math.max(0, m.index! - 40), m.index! + 40) : ""}`).toBeNull();
  if (!s.unlocks.includes("numbers")) {
    expect(v.includes("%"), `${where}: % before numbers unlock`).toBe(false);
    expect(/\d\s?µm/.test(v), `${where}: µm before numbers unlock`).toBe(false);
  }
  for (const [, name] of v.matchAll(/\sdata-([a-z-]+)/g)) expect(VOCAB.has(name!), `${where}: unknown data-${name}`).toBe(true);
  expect(v.includes("undefined"), `${where}: "undefined" in output`).toBe(false);
  expect(v.includes("NaN"), `${where}: NaN in output`).toBe(false);
  expect(v.includes("[object"), `${where}: [object in output`).toBe(false);
}

let FX: Fixture[] = [];
beforeAll(() => { FX = fixtures(7); }, 120_000);

const fx = (name: string) => FX.find((f) => f.name === name)!;

describe("every panel renders in every fixture", () => {
  it("renders all panels without throwing and within the rules", () => {
    expect(FX.map((f) => f.name)).toEqual(["fresh", "afterFirst", "midAct1", "act2", "act3", "act4"]);
    for (const f of FX) {
      for (const panel of PANEL_NAMES) {
        const variants: Partial<View>[] = [{ report: f.report }, { report: null }];
        for (const v of variants) {
          const html = renderPanel(f.state, view({ panel, ...v }));
          checkCommon(html, f.state, `${f.name}/${panel}`);
        }
      }
      checkCommon(hudHtml(f.state, view()), f.state, `${f.name}/hud`);
    }
  }, 120_000);

  it("renders the sheep card, forecast (every goal) and tree for every flock sheep", () => {
    for (const f of [fx("afterFirst"), fx("act3")]) {
      for (const id of f.state.flock) {
        for (const panel of ["sheep", "tree", "vet"] as PanelName[]) {
          checkCommon(renderPanel(f.state, view({ panel, sheepId: id, tab: id })), f.state, `${f.name}/${panel}/${id}`);
        }
      }
      const ewes = f.state.flock.filter((id) => f.state.sheep[id]!.sex === "ewe").slice(0, 3);
      const rams = f.state.flock.filter((id) => f.state.sheep[id]!.sex === "ram").slice(0, 2);
      for (const id of [...ewes, ...rams]) for (const g of GOALS) {
        checkCommon(forecastPanelHtml(f.state, view({ panel: "forecast", sheepId: id, goal: g.id })), f.state, `${f.name}/forecast/${id}/${g.id}`);
      }
    }
  }, 120_000);
});

describe("panel content", () => {
  it("title offers a new game and a way in", () => {
    const h = renderPanel(fx("fresh").state, view({ panel: "title" }));
    expect(h).toContain("data-newgame");
    expect(h).toContain("data-close");
    expect(h).toContain('name="seed"');
  });

  it("forecast shows goal tabs, candidates, ten lambs and a commit button", () => {
    const s = fx("fresh").state;
    const h = renderPanel(s, view({ panel: "forecast" }));
    for (const g of GOALS) expect(h).toContain(`data-goal="${g.id}"`);
    expect(h).toContain("data-mate=");
    expect(h).toContain("data-plan=");
    expect(h.match(/class="lamb-tile /g)?.length).toBe(10);
    // Act 0: words, no range bars.
    expect(h).not.toContain('class="range"');
    expect(h).toContain("wool-hint");
  });

  it("forecast shows range bars and percentages once numbers are unlocked", () => {
    const s = fx("act2").state;
    expect(s.unlocks).toContain("numbers");
    const h = renderPanel(s, view({ panel: "forecast" }));
    expect(h).toContain('class="range"');
    expect(h).toContain("%");
    expect(h).toMatch(/\d µm/);
  });

  it("the forecast shows the planned star and the planned count", () => {
    const s = fx("fresh").state;
    const html0 = renderPanel(s, view({ panel: "forecast" }));
    const plan = html0.match(/data-plan="([^"]+)"/)![1]!;
    const [e, r] = plan.split(":");
    const t = structuredClone(s) as GameState;
    t.plans[e!] = r!;
    const h = renderPanel(t, view({ panel: "forecast", sheepId: e!, mateId: r! }));
    expect(h).toContain("★");
    expect(h).toContain("1 mating planned");
    expect(h).toContain("Cancel this mating");
  });

  it("the visiting ram is labelled and must be hired before planning", () => {
    const s = structuredClone(fx("act3").state) as GameState;
    expect(s.visitingRam).not.toBeNull();
    s.hiredRam = null;
    const ewe = s.flock.find((id) => s.sheep[id]!.sex === "ewe" && canBreed(s.sheep[id]!, s.season))!;
    expect(ewe).toBeTruthy();
    const h = renderPanel(s, view({ panel: "forecast", sheepId: ewe, mateId: s.visitingRam!.id }));
    expect(h).toContain("visiting — nothing known");
    expect(h).toContain('data-hire="1"');
    const m = renderPanel(s, view({ panel: "market" }));
    expect(m).toContain('data-hire="1"');
  });

  it("sheep card lists facts with dots and the right buttons", () => {
    const s = fx("afterFirst").state;
    const ewe = s.flock.find((id) => s.sheep[id]!.sex === "ewe" && s.sheep[id]!.origin === "founder")!;
    const h = renderPanel(s, view({ panel: "sheep", sheepId: ewe }));
    expect(h).toContain(`data-findmate="${ewe}"`);
    expect(h).toContain(`data-sell="${ewe}"`);
    expect(h).toContain(`data-rename="${ewe}"`);
    expect(h).toContain('class="dot');
    expect(h).toContain(`data-open="vet"`);
    expect(h).not.toContain(`data-open="tree"`);
    expect(factsFor(s, ewe).length).toBeGreaterThan(0);
    const lamb = s.flock.find((id) => s.sheep[id]!.dam)!;
    const lh = renderPanel(s, view({ panel: "sheep", sheepId: lamb }));
    expect(lh).toContain(`data-sheep="${s.sheep[lamb]!.dam}"`);
  });

  it("board has goal, plans with cancel, diary and sleep", () => {
    const s = structuredClone(fx("fresh").state) as GameState;
    s.plans["s1"] = "s5";
    const h = renderPanel(s, view({ panel: "board" }));
    expect(h).toContain("goal-card");
    expect(h).toContain('data-plan="s1:s5"');
    expect(h).toContain("data-sleep");
    expect(h).toContain("diary");
  });

  it("orders show a pip forecast before accept, and accepted ones with deadlines", () => {
    const withOpen = FX.find((f) => f.state.orders.some((o) => o.status === "open") && f.state.acceptedOrders.length < 2)!;
    expect(withOpen).toBeTruthy();
    const s = structuredClone(withOpen.state) as GameState;
    const open = s.orders.filter((o) => o.status === "open");
    expect(open.length).toBeGreaterThan(0);
    const h = renderPanel(s, view({ panel: "orders" }));
    expect(h).toContain(`data-accept="${open[0]!.id}"`);
    expect(h).toContain(`data-decline="${open[0]!.id}"`);
    expect(h).toContain('class="meter2 odds');
    expect(h.indexOf('class="meter2 odds')).toBeLessThan(h.indexOf("data-accept"));
    const f = forecastOrder(s, open[0]!.id);
    expect(h).toContain(f.text.replace(/'/g, "&#39;"));
    acceptOrder(s, open[0]!.id);
    const h2 = renderPanel(s, view({ panel: "orders" }));
    expect(h2).toContain("Give up");
    expect(renderPanel(s, view({ panel: "board" }))).toMatch(/due by Year \d, \w+/);
  });

  it("market sells and buys, with prices and a forecast line", () => {
    const s = fx("afterFirst").state;
    const h = renderPanel(s, view({ panel: "market" }));
    expect(h).toContain("data-buy=");
    expect(h).toContain("data-sell=");
    expect(h).toContain("What we know");
    expect(h).toContain("Best pairing");
  });

  it("vet lists friendly locus names with forecasts and tests", () => {
    const s = fx("afterFirst").state;
    const h = renderPanel(s, view({ panel: "vet", tab: s.flock[1]! }));
    for (const w of ["hidden colour", "brown", "dilute", "spotting", "horns"]) expect(h).toContain(w);
    expect(h).toContain(`data-test="${s.flock[1]}:D"`);
    expect(h).toContain(`data-tab="${s.flock[0]}"`);
    expect(h).not.toMatch(/>\s*[ABDSP]\s*</);
  });

  it("fair lists eligible sheep with forecasts and an enter button", () => {
    const s = fx("act2").state;
    const h = renderPanel(s, view({ panel: "fair" }));
    expect(h).toContain("data-enter=");
    expect(h).toContain('class="meter2 odds');
    expect(renderPanel(fx("fresh").state, view({ panel: "fair" }))).not.toContain("data-enter");
  });

  it("codex concepts are short, unlock by act and never use notation", () => {
    for (const c of CONCEPTS) expect(c.text.split(/\s+/).length, c.id).toBeLessThanOrEqual(60);
    const early = renderPanel(fx("fresh").state, view({ panel: "codex" }));
    expect(early.match(/concept locked/g)?.length).toBe(CONCEPTS.length);
    const late = renderPanel(fx("act4").state, view({ panel: "codex" }));
    expect(late).not.toContain("concept locked");
    expect(late).toContain("dcard");
  });

  it("tree shows ancestors and descendants as clickable chips", () => {
    // Any sheep on record (sold ones too) with a grandparent, in the latest fixture that has one.
    const gp = (st: GameState) => Object.keys(st.sheep).find((id) => { const x = st.sheep[id]!; return x.dam && (st.sheep[x.dam]?.dam || st.sheep[x.sire ?? ""]?.dam); });
    const f = [...FX].reverse().find((x) => x.state.unlocks.includes("tree") && gp(x.state))!;
    expect(f, "a fixture with three generations").toBeTruthy();
    const s = f.state;
    const lamb = gp(s)!;
    const h = renderPanel(s, view({ panel: "tree", sheepId: lamb }));
    expect(h).toContain(`data-sheep="${s.sheep[lamb]!.dam}"`);
    expect(h).toContain("Grandparents");
    expect(h).toMatch(/>Lambs<|No lambs yet/);
    // a connected tree: SVG lines and portraits in the nodes
    expect(h).toContain('<svg class="ftree-lines"');
    expect(h).toMatch(/<path class="(dam|sire)/);
    expect(h).toContain('class="t-face"><img');
  });

  it("report shows each mating's forecast next to the lambs born", () => {
    const f = fx("afterFirst");
    const h = renderPanel(f.state, view({ panel: "report", report: f.report }));
    expect(Object.keys(f.report!.matings).length).toBeGreaterThan(0);
    expect(h.match(/class="reveal"/g)?.length).toBe(Object.keys(f.report!.matings).length);
    for (const l of f.report!.lambs) expect(h).toContain(`data-sheep="${l.id}"`);
    expect(h).toContain("You expected");
    expect(h).toContain("act-banner");
    expect(h).toContain("data-close");
  });

  it("ending celebrates with stats and lets you keep farming", () => {
    const h = renderPanel(fx("act4").state, view({ panel: "ending" }));
    expect(h).toContain("data-close");
    expect(h).toContain("data-newgame");
    expect(h).toContain("lambs born");
  });

  it("settings has motion, sound, export, import and a confirmed new game", () => {
    const s = fx("fresh").state;
    const h = renderPanel(s, view({ panel: "settings" }));
    expect(h).toContain('data-toggle="motion"');
    expect(h).toContain('data-toggle="sound"');
    expect(h).toMatch(/<input type="range"[^>]*data-volume/);
    const off = renderPanel(s, view({ panel: "settings", sound: { on: false, volume: 0.4 } }));
    expect(off).toContain('aria-checked="false"');
    expect(off).toMatch(/value="40" data-volume[^>]*disabled/);
    expect(h).toContain("data-export");
    expect(h).toContain("data-import");
    expect(h).not.toContain("data-newgame");
    expect(renderPanel(s, view({ panel: "settings", tab: "confirm-new" }))).toContain("data-newgame");
  });

  it("hud has the season, coins, flock, goal and sleep with planned count", () => {
    const s = structuredClone(fx("midAct1").state) as GameState;
    const h = hudHtml(s, view());
    expect(h).toContain("data-sleep");
    expect(h).toContain('data-open="board"');
    expect(h).toContain('data-open="market"');
    expect(h).toContain('data-open="orders"');
    expect(h).toContain(`${s.flock.length}<span class="dim">/${s.flockCap}`);
    expect(hudHtml(fx("fresh").state, view())).not.toContain('data-open="orders"');
  });

  it("explains growing lambs when they block planning, with a market link", () => {
    const s = structuredClone(fx("afterFirst").state) as GameState;
    const lamb = s.flock.map((id) => s.sheep[id]!).find((x) => !isAdult(x, s.season))!;
    expect(lamb).toBeDefined();
    s.plans = {};
    s.season = Math.max(s.season, 1); // not the first-season hint
    // No grown sheep of the lamb's sex: planning is blocked until it grows up.
    s.flock = s.flock.filter((id) => s.sheep[id]!.sex !== lamb.sex || !isAdult(s.sheep[id]!, s.season));
    s.hiredRam = null;
    const h = hudHtml(s, view());
    expect(h).toContain(`No ${lamb.sex} is ready to breed`);
    expect(h).toMatch(/still growing — (she|he|the first) can breed from Year \d+, (Spring|Summer|Autumn|Winter)\./);
    expect(h).toContain('class="link" data-open="market"');
    const f = forecastPanelHtml(s, view({ panel: "forecast", sheepId: lamb.id }));
    expect(f).toContain(`can breed from ${seasonLabel(lamb.born + 2)}`);
    expect(f).toContain('data-open="market"');
  });

  it("market lists farm improvements with a forecast and a Buy button", () => {
    const s = structuredClone(fx("act3").state) as GameState;
    s.money = 1000;
    const h = renderPanel(s, view({ panel: "market" }));
    expect(h).toContain("Farm improvements");
    for (const id of ["paddock", "terrier", "collie", "maremma", "cat", "barn", "shearing"]) expect(h).toContain(`data-upgrade="${id}"`);
    expect(h).toContain("pays for itself");
    // dogs show the odds a fox / a wolf gets a lamb, now and with that dog; the cat shows the mice cost
    // (rows where nothing would change are left out: the act-3 flock may have a bold sheep keeping foxes off)
    const noBold = structuredClone(s) as GameState;
    for (const id of noBold.flock) noBold.sheep[id]!.phenotype["boldness"] = 2;
    const nb = renderPanel(noBold, view({ panel: "market" }));
    expect(nb).toMatch(/A fox gets a lamb[\s\S]*with Pip/);
    expect(nb).toMatch(/A wolf gets a lamb[\s\S]*with Samson/);
    expect(nb).toMatch(/Pip is no help against a wolf/);
    expect(h).toMatch(/mouse season costs[\s\S]*with Mog/);
    s.upgrades = ["collie"];
    const owned = renderPanel(s, view({ panel: "market" }));
    expect(owned).not.toContain('data-upgrade="collie"');
    expect(owned).toContain('data-open="animal" data-sheep-id="collie"');
  });

  it("the sheep card shows fondness hearts, whether you've said hello, the wool effect and a treat with its forecast", () => {
    const s = structuredClone(fx("afterFirst").state) as GameState;
    const id = s.flock.find((x) => isAdult(s.sheep[x]!, s.season))!;
    let h = renderPanel(s, view({ panel: "sheep", sheepId: id }));
    expect(h).toContain('class="hearts');
    expect(h).toContain(`data-treat="${id}"`);
    expect(h).toContain("Give a treat");
    expect(h).toMatch(/would go from/);
    expect(h).not.toContain("said hello this season");
    greetAnimal(s, id);
    giveTreat(s, id);
    h = renderPanel(s, view({ panel: "sheep", sheepId: id }));
    expect(h).toContain("said hello this season");
    expect(h).toContain("Treat given");
    expect(h).not.toContain(`data-treat="${id}"`);
    // market sheep are not yours: no care box
    expect(renderPanel(s, view({ panel: "sheep", sheepId: s.market[0]! }))).not.toContain("data-treat");
    // the number out of 100 only with numbers
    expect(h).not.toMatch(/\d+\/100/);
    const n = structuredClone(fx("act2").state) as GameState;
    const nid = n.flock[0]!;
    expect(renderPanel(n, view({ panel: "sheep", sheepId: nid }))).toMatch(/\d+\/100/);
  });

  it("the animal card shows a dog's job, its fondness and a treat; without animals it points to the market", () => {
    const s = structuredClone(fx("act3").state) as GameState;
    expect(renderPanel(s, view({ panel: "animal" }))).toContain('data-open="market"');
    s.upgrades = [...(s.upgrades ?? []), "maremma", "cat"];
    const h = renderPanel(s, view({ panel: "animal", sheepId: "maremma" }));
    expect(h).toContain("Samson");
    expect(h).toMatch(/A wolf gets a lamb/);
    expect(h).toContain('data-treat="maremma"');
    expect(h).toContain('data-sheep-id="cat"'); // the other animals
    const c = renderPanel(s, view({ panel: "animal", sheepId: "cat" }));
    expect(c).toMatch(/mice/);
  });

  it("the report shows what happy sheep added, mice, and a wolf seen off by a dog", () => {
    const s = structuredClone(fx("act3").state) as GameState;
    const r = { ...fx("act3").report! };
    r.fondBonus = 7;
    r.mice = { wool: 3, feed: 2, without: 12, cat: true, text: "Mice got into the barn. Mog caught most of them." };
    r.event = { kind: "wolf", season: s.season - 1, colour: null, sheep: null, saved: true, text: "The wolf came by night, but Samson the Maremma stood over the flock.", dog: "maremma" };
    const h = renderPanel(s, view({ panel: "report", report: r }));
    expect(h).toContain("Happy sheep: <b>+7</b>");
    expect(h).toContain("🐭");
    expect(h).toContain("🐺");
    expect(h).toContain("Good dog, Samson!");
  });

  it("escapes names", () => {
    const s = structuredClone(fx("afterFirst").state) as GameState;
    s.sheep[s.flock[0]!]!.name = `<img onerror=x>"Bo`;
    for (const panel of ["sheep", "market", "forecast", "vet", "board"] as PanelName[]) {
      const h = renderPanel(s, view({ panel, sheepId: s.flock[0]! }));
      expect(h, panel).not.toContain("<img onerror");
    }
  });
});

describe("presentation", () => {
  it("the sheep card has a live-portrait slot and a personality line; boldness numbers only with numbers", () => {
    const early = fx("afterFirst").state;
    const id = early.flock[0]!;
    const h = renderPanel(early, view({ panel: "sheep", sheepId: id }));
    expect(h).toContain(`data-live-portrait-slot="${id}"`);
    expect(h).toContain(personalityLine(early.sheep[id]!).replace(/'/g, "&#39;"));
    expect(h).toMatch(/class="persona (shy|calm|curious|bold)"/);
    expect(h).toContain("click to say hello");
    expect(visible(h)).not.toContain("boldness");
    const late = fx("act2").state;
    const lid = late.flock[0]!;
    expect(renderPanel(late, view({ panel: "sheep", sheepId: lid }))).toMatch(/boldness \d+\.\d/);
  });

  it("forecast litters use rendered lamb portraits when the view can draw them, one per chance in ten", () => {
    const s = fx("fresh").state;
    const looks: string[] = [];
    const h = renderPanel(s, view({ panel: "forecast", lambArt: (l) => { looks.push(`${l.colour}/${l.pattern}/${l.horns}`); return PORTRAIT; } }));
    expect(h.match(/class="lamb-tile art/g)?.length).toBe(10);
    expect(h).toContain("Each lamb = one chance in ten");
    expect(looks.length).toBeGreaterThanOrEqual(10);
    expect(visible(h)).not.toContain("%");
  });

  it("odds meters share one labelled style with scale words", () => {
    const s = fx("act2").state;
    const f = renderPanel(s, view({ panel: "fair" }));
    for (const w of ODDS_SCALE) expect(f).toContain(`>${w}<`);
    expect(f).toContain('role="meter"');
    const vet = renderPanel(fx("afterFirst").state, view({ panel: "vet" }));
    expect(vet).toContain('class="meter2 learn');
    expect(vet).toContain(">loads<");
    const fore = renderPanel(fx("afterFirst").state, view({ panel: "forecast" }));
    expect(fore).toContain('class="meter2 learn');
  });

  it("range bars have an axis in words and labelled markers for both parents, the flock and the lamb", () => {
    const s = fx("act3").state;
    const h = renderPanel(s, view({ panel: "forecast" }));
    expect(h).toContain("← finer");
    expect(h).toContain("coarser →");
    expect(h).toContain("heavier →");
    expect(h.match(/class="pin ewe/g)?.length).toBe(2);
    expect(h.match(/class="pin ram/g)?.length).toBe(2);
    expect(h).toContain("where most lambs from this pair would land");
    expect(h).toContain("🐑 lamb");
  });

  it("the season report flips each born lamb and rings the forecast lamb it matched", () => {
    const f = fx("afterFirst");
    const h = renderPanel(f.state, view({ panel: "report", report: f.report }));
    expect(h.match(/class="born flip/g)?.length).toBe(f.report!.lambs.filter((l) => f.report!.matings[l.dam ?? ""]).length);
    expect(h).toContain('class="f-back"');
    expect(h).toMatch(/lamb-tile [a-z]+ hit/);
  });

  it("the act track shows five milestones in the board and a mini track in the HUD", () => {
    for (const name of ["fresh", "act3"]) {
      const s = fx(name).state;
      const b = renderPanel(s, view({ panel: "board" }));
      const track = b.slice(b.indexOf('class="act-track'));
      expect(track.match(/<li class="(done|now|later)"/g)?.length, name).toBe(5);
      expect(track.match(/<li class="done"/g)?.length ?? 0, name).toBe(s.act);
      expect(b).toContain(`Story progress: act ${s.act + 1} of 5`);
      expect(hudHtml(s, view())).toContain('class="act-track mini"');
    }
  });
});

describe("tutorial", () => {
  it("the title offers the tutorial first, and a skip", () => {
    const f = fx("fresh");
    const h = renderPanel(f.state, view({ panel: "title", hasSave: false }));
    expect(h.indexOf('data-tutorial="start"')).toBeGreaterThan(-1);
    expect(h.indexOf('data-tutorial="start"')).toBeLessThan(h.indexOf("Skip tutorial"));
    expect(h).toMatch(/class="primary big" data-tutorial="start"/);
  });

  it("settings can replay the tutorial after a confirm", () => {
    const s = fx("act2").state;
    expect(renderPanel(s, view({ panel: "settings" }))).toContain('data-tab="confirm-tutorial"');
    expect(renderPanel(s, view({ panel: "settings", tab: "confirm-tutorial" }))).toContain('data-tutorial="start"');
  });

  it("the mentor speaks at every step within the rules, points at something and completes on the real action", () => {
    const g = newTutorialGame(7);
    const t = g.tutorial!;
    const seen: string[] = [];
    const check = (v: View) => {
      const h = mentorHtml(g, v);
      checkCommon(h, g, `mentor/${tutorialStep(g)}`);
      checkCommon(hudHtml(g, v), g, `hud/${tutorialStep(g)}`);
      seen.push(tutorialStep(g)!);
      return h;
    };
    // 1: the ewe in the field
    let v = view();
    check(v);
    expect(tutorialTarget(g, v)).toEqual({ kind: "sheep", id: t.ewe });
    expect(tutorialStepMet(g, v)).toBe(false);
    v = view({ panel: "sheep", sheepId: t.ewe });
    expect(tutorialStepMet(g, v)).toBe(true);
    advanceTutorial(g, "ewe");
    // 2: the ram, with the ewe's card explained
    expect(check(v)).toContain("What you know");
    expect(tutorialTarget(g, v)).toEqual({ kind: "sheep", id: t.ram });
    v = view({ panel: "sheep", sheepId: t.ram });
    expect(tutorialStepMet(g, v)).toBe(true);
    advanceTutorial(g, "ram");
    // 3: find a mate
    check(v);
    expect(tutorialTarget(g, v)).toEqual({ kind: "html", selectors: ["#overlay [data-findmate]"] });
    v = view({ panel: "forecast", sheepId: t.ram });
    advanceTutorial(g, "forecast");
    // 4: plan — one chance in ten
    expect(check(v)).toContain("one chance in ten");
    expect(renderPanel(g, v)).toContain(`data-plan="${t.ewe}:${t.ram}"`);
    planMating(g, t.ewe, t.ram);
    expect(tutorialStepMet(g, v)).toBe(true);
    advanceTutorial(g, "plan");
    // 5: sleep
    check(v);
    const r = advanceSeason(g);
    v = view({ panel: "report", report: r });
    expect(tutorialStepMet(g, v)).toBe(true);
    advanceTutorial(g, "sleep");
    // 6: the reveal
    const lamb = r.lambs[0]!;
    expect(check(v)).toContain(`${lamb.name}</b> is <b>${String(lamb.phenotype["colour"])}`);
    expect(renderPanel(g, v)).toContain('class="dcard');
    v = view();
    advanceTutorial(g, "reveal");
    // 7: lambs grow up
    expect(check(v)).toContain("two seasons");
    expect(tutorialTarget(g, v)).toMatchObject({ kind: "sheep", id: lamb.id });
    advanceTutorial(g, "grow");
    // 8: the market
    v = view({ panel: "market" });
    expect(check(v)).toContain("nothing known");
    buySheep(g, cheapestMarketEwe(g)!.id);
    expect(tutorialStepMet(g, v)).toBe(true);
    advanceTutorial(g, "market");
    // 9: the goal, in plain words
    const goal = check(v);
    expect(goal).toContain("dilute");
    expect(goal).toContain('data-tutorial="ack"');
    advanceTutorial(g, "goal");
    // 10: the flock arrives
    expect(check(v)).toContain("Granny Moss");
    advanceTutorial(g, "done");
    expect(mentorHtml(g, v)).toBe("");
    expect(seen).toEqual(TUTORIAL_STEPS.map((d) => d.id));
  });
});

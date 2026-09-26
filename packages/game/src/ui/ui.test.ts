import { beforeAll, describe, expect, it } from "vitest";
import { GOALS, acceptOrder, canBreed, factsFor, forecastOrder, type GameState } from "../core/index.js";
import { CONCEPTS, PANEL_NAMES, hudHtml, renderPanel, forecastPanelHtml, type View, type PanelName } from "./index.js";
import { fixtures, type Fixture } from "./fixtures.js";

const PORTRAIT = "data:image/png;base64,AAAA";
const GENOTYPE = /[A-Za-z]\/[A-Za-z]/;
const VOCAB = new Set([
  "close", "open", "sheep", "findmate", "mate", "goal", "plan", "buy", "sell", "hire", "test", "accept", "decline",
  "enter", "sleep", "rename", "newgame", "tab", "toggle", "export", "import", "sheep-id",
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
    expect(h.match(/class="lamb[ "]/g)?.length).toBe(10);
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
    expect(h).toContain('class="pips"');
    expect(h.indexOf('class="pips"')).toBeLessThan(h.indexOf("data-accept"));
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
    expect(h).toContain('class="pips"');
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
    expect(h).toContain("Descendants");
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

  it("settings has motion, export, import and a confirmed new game", () => {
    const s = fx("fresh").state;
    const h = renderPanel(s, view({ panel: "settings" }));
    expect(h).toContain('data-toggle="motion"');
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

  it("escapes names", () => {
    const s = structuredClone(fx("afterFirst").state) as GameState;
    s.sheep[s.flock[0]!]!.name = `<img onerror=x>"Bo`;
    for (const panel of ["sheep", "market", "forecast", "vet", "board"] as PanelName[]) {
      const h = renderPanel(s, view({ panel, sheepId: s.flock[0]! }));
      expect(h, panel).not.toContain("<img onerror");
    }
  });
});

# Blue Sheep v1 — build contracts

This file is the agreement between the parallel work streams that build the
complete game. Each stream owns specific paths and must implement the
interfaces below exactly, so the integration step is wiring, not negotiation.
Read `docs/DESIGN.md` first for intent; this file is the mechanics.

## 0. Non-negotiable invariants (from DESIGN.md and AGENT-WORKFLOW.md)

- All randomness in game logic flows through `createRng` from
  `@blue-sheep/genetics`; `advanceSeason`-style functions are deterministic for
  a given serialized state. `Math.random` is allowed only in cosmetic world
  animation.
- `packages/genetics` and `packages/inference` stay pure and UI-free.
- **No genotype strings in player-facing UI, ever.** Plain sentences with
  confidence dots. Percentages/h²/curves only when `unlocks` includes
  `"numbers"`.
- Forecasts are knowledge-limited: computed from posteriors and farm records,
  never from the true genome.
- Every player choice follows **Decide → Forecast → Commit → Reveal → Learn**.
- Nothing is "done" until `npm run probe` has booted the built game and
  observed the outcome.

## 1. The finished game (scope of v1)

Turn-based cozy breeding game. One season per "sleep". Story arc of five acts,
then endless mode.

| Act | Hook / villager line | Goal to advance | Unlocks on entry |
|-----|----------------------|-----------------|------------------|
| 0 | "The old farm is yours. Let's see what the flock gives us." | First lambs born (any planned mating produces a lamb) | Forecast panel (icons only), notebook facts |
| 1 | Surprise lamb → "Hidden colours! Breed me a **blue** sheep." | A blue lamb is born | Discovery cards, vet carrier test, orders board |
| 2 | Wool buyer: "I pay for fineness." | Fulfil 3 wool/colour orders (any); up to 2 filled before act 2 count, so at least one is filled in act 2 (`ORDERS_CARRIED`) | Fleece range bars, `numbers` unlock (percentages), village fair |
| 3 | Small inbred lambs → "Blood too close. Bring in fresh rams." | Win a village fair (1st place, any category) | Family tree page, visiting rams, flock cap 16 |
| 4 | "Found your own breed." | Registry: ≥6 living blue sheep, flock mean fineness ≤ 24 µm, mean inbreeding of those six < 0.125 | Ending screen, endless mode, flock cap 24 |

Other systems (all pure TS in `packages/game/src/core`, all tested):

- **Orders**: villagers post orders (max 3 open, max 2 accepted). Kinds:
  `colour` (a lamb/sheep of colour X, optional sex), `wool` (deliver N kg under
  M µm this shearing), `horns` (a horned/polled sheep). Deadline in seasons.
  Reward coins + reputation. Failing costs reputation. Accepting is a decision
  with a forecast: probability of fulfilling from the current flock + planned
  matings (Monte Carlo over knowledge-limited forecasts, seeded).
- **Fair**: every autumn (season % 4 === 2) from act 2. Category rotates:
  finest wool, heaviest fleece, rarest colour, biggest. Player enters one sheep.
  Forecast: entry vs expected field (field quality grows with year). Placings
  1–3 pay coins; 1st gives a rosette on the sheep and counts for act 3.
- **Visiting ram**: each spring from act 3 a ram is offered for hire for that
  season only. No pedigree, nothing known → forecast bands wide. Hire fee.
- **Vet**: pay to test one sheep for one locus (A, B, D, S, P). Sets
  `sheep.tested[locus]`. Forecast for the decision: how much the test would
  narrow what you know (entropy of that marginal, shown as words/dots).
- **Events**: one per winter from act 1: `hardWinter` (feed cost ×2 that
  season; a random low-size sheep falls ill and misses breeding), `fox`
  (one lamb lost unless the flock has an adult with boldness ≥ 7 or the
  `dog` improvement; the `barn` improvement stops hard-winter illness), `woolBoom`
  (one colour's wool price ×2 next season, announced in advance so it is a
  decision).
- **Economy**: wool income per adult each season (existing formula), feed cost
  per sheep per season (`feedPerHead(season)`: 2 coins in years 1–2, then
  dearer each year up to `FEED_MAX`), buy/sell at the market (the trader pays
  a shrinking share of a sheep's worth each year: `sellFactor(season)`),
  order rewards, fair prizes, vet fees, hire fees, farm improvements. Money
  may not go below 0: if feed cannot be paid, the sim auto-sells the
  lowest-value sheep and reports it.
- **Farm improvements** (`core/upgrades.ts`, defs in `config.ts` `UPGRADES`):
  one-time purchases in the market panel's "Farm improvements" section, each
  shown with `forecastUpgrade(state, id).text` (what it would change for this
  farm) before the Buy button. `paddock` (+4 flock cap), `dog` (a fox never
  takes a lamb), `barn` (nobody falls ill in a hard winter), `shearing`
  (wool ×1.25; the report shows `SeasonReport.shedBonus`), `meadow` (+6 cap,
  act 3+, needs `paddock`). Stored in `state.upgrades: UpgradeId[]`
  (optional; saves without it load as `[]`). Cap bonuses stack on top of each
  act's cap. `buyUpgrade(state, id)` throws a player-readable message when
  already owned, too early, missing its prerequisite, or unaffordable.
- **Discovery cards**: everything learned about one sheep in one update is a
  single card (`Discovery.loci` lists every locus on it; `locus` is the first).
- **Ageing**: adults at 2 seasons, ewes breed until age 20, death at 24.
- **Litter rule**: a valid planned mating always produces ≥1 lamb unless the
  ewe is ill; twins possible. (The "no lamb" bug must not return.)

## 2. Paths and ownership

```
packages/game/src/core/      Stream A: state, sim, acts, orders, fair, events, vet, market, economy, knowledge
packages/game/src/world3d/   Stream B: Three.js diorama (WorldView)
packages/game/src/ui/        Stream C: HTML panels (pure functions of state) + CSS
packages/game/src/app.ts     Stream D: controller (wires core + world + ui), deep links, window.__game
packages/game/src/main.ts    Stream D
packages/game/probe/         Stream P: Playwright probes, screenshot artifacts
packages/game/scripts/       Stream A: oracle/balance sims
CLAUDE.md                    Stream P
```

Stream A moves the existing `state.ts`, `sim.ts`, `knowledge.ts`, `names.ts`
into `core/` and re-exports everything from `core/index.ts`. Old
`world/`, `pixel/`, `sprite.ts` (Phaser) are deleted by Stream D.

## 3. Core API (Stream A) — `packages/game/src/core/index.ts`

Must export at least:

```ts
// state
export interface GameState { /* version: 2, plus fields below */ }
export function newGame(seed: number): GameState;
export function serialize(s: GameState): string;
export function deserialize(json: string): GameState;   // migrates v1 → v2 or throws
export function seasonLabel(season: number): string;    // "Year 1, Spring"
export function isAdult(s: Sheep, season: number): boolean;

// one-season turn. Uses state.plans, state.orders, state.fairEntry, state.hiredRam.
export function advanceSeason(state: GameState): SeasonReport;

// player actions (each validates, mutates, logs; throws Error with a player-readable message)
export function planMating(state, eweId, ramId): void;      // toggles
export function unplanMating(state, eweId): void;
export function buySheep(state, id): void;
export function sellSheep(state, id): number;
export function vetTest(state, sheepId, locus): void;
export function acceptOrder(state, orderId): void;
export function declineOrder(state, orderId): void;
export function enterFair(state, sheepId | null): void;
export function hireVisitingRam(state): void;
export function renameSheep(state, id, name): void;
export function buyUpgrade(state, id): void;                // farm improvement (see §1)

// forecasts (knowledge-limited; all pure)
export function forecastCross(state, eweId, ramId): CrossForecast;   // existing shape + keep
export function candidates(state, forId): Sheep[];
export function forecastOrder(state, orderId): { pFill: number; text: string };
export function forecastFair(state, sheepId): { pWin: number; pPlace: number; text: string };
export function forecastVet(state, sheepId, locus): { gainBits: number; text: string };
export function factsFor(state, sheepId): Fact[];
export function familyTree(state, sheepId): { ancestors: ..., descendants: ... };

// progression
export function currentAct(state): ActInfo;    // { act, title, goalText, progressText, progress: 0..1 }
export function isEnding(state): boolean;      // act 4 goal reached and ending not yet shown
export interface SeasonReport {
  season: number; lambs: Sheep[]; income: number; feed: number; deaths: Sheep[];
  discoveries: Discovery[]; orderResults: {...}[]; fairResult: {...} | null;
  event: {...} | null; actAdvanced: ActInfo | null; messages: string[];
  forecastsSeen: Record<eweId, CrossForecast>;   // what the player saw, so the report can show reveal vs forecast
}
```

State fields added in v2 (names are fixed so UI and probes can rely on them):
`act`, `reputation`, `orders: Order[]`, `acceptedOrders: string[]`,
`fair: { nextSeason, category, entry: string|null, history: FairResult[] }`,
`visitingRam: { id, fee, season } | null`, `hiredRam: string|null`,
`events: EventRecord[]`, `pendingEvent: ...|null`, `unlocks: string[]`
(values: `"numbers" | "vet" | "orders" | "fair" | "tree" | "visitor" | "cards"`),
`ending: { shown: boolean; season: number } | null`, `stats` (lambs born,
blues born, coins earned, discoveries, fairs won).

## 4. World API (Stream B) — `packages/game/src/world3d/index.ts`

Zero imports from `core/`. Pure presentation driven by snapshots.

```ts
export type Zone = "paddock" | "paddock2" | "barn" | "market" | "visitor";
export type Hotspot = "house" | "shed" | "market" | "vet" | "fairground" | "mailbox";
export interface WorldSheep {
  id: string; name: string; sex: "ewe" | "ram"; adult: boolean;
  colour: "white" | "black" | "brown" | "blue" | "fawn";
  pattern: "solid" | "spotted"; horns: "polled" | "horned";
  size: number;         // kg, typically 40–80 → body scale
  fleeceWeight: number; // kg, typically 2–6 → wool puffiness
  fineness: number;     // µm, 16–36 → lower = subtle sheen
  crimp: number;        // /cm, 2–8 → wool bumpiness
  zone: Zone;
  marker?: "planned" | "new" | "ill" | "rosette" | "selected" | null;
}
export interface WorldSnapshot {
  season: 0 | 1 | 2 | 3;      // spring..winter: light, foliage colour, snow in winter
  year: number;
  sheep: WorldSheep[];
  selected: string | null;
  paddock2: boolean;          // second paddock fenced & open
  visitorPresent: boolean;    // visiting ram pen occupied
  fairToday: boolean;         // bunting on the fairground
}
export interface WorldHandlers {
  onSheep(id: string): void;
  onHotspot(h: Hotspot): void;
  onHover?(target: { kind: "sheep"; id: string } | { kind: "hotspot"; id: Hotspot } | null): void;
}
export class WorldView {
  constructor(container: HTMLElement, handlers: WorldHandlers, opts?: { seed?: number; reducedMotion?: boolean });
  setSnapshot(s: WorldSnapshot): void;  // diff: new sheep pop in with a little bounce; removed fade out
  portrait(sheep: WorldSheep, px?: number): string; // PNG data URL of that sheep on a pastel background
  celebrate(id: string): void;         // sparkles/confetti above a sheep
  focus(id: string | Hotspot): void;   // glide camera
  sleepTransition(): Promise<void>;    // dusk → night → dawn, ~1.5 s, resolves at darkest point? No: resolves when fully dark; call again with dawn(): Promise<void>
  dawn(): Promise<void>;
  resize(): void;
  dispose(): void;
}
```

Visual direction: orthographic isometric camera, flat-shaded low-poly, pastel
palette, soft shadows, sheep idle animations (breathing, head bob, grazing,
occasional wander within their zone). Farm diorama: farmhouse (sleep), shed
with notice board, market stall with a trader, vet hut, fairground with
bunting, mailbox by the gate, two paddocks, pond, a few trees. Hotspots glow
faintly on hover and show a floating label. Must render in headless Chrome
(swiftshader) and on a laptop iGPU at 60 fps with 40 sheep.

## 5. UI panels (Stream C) — `packages/game/src/ui/`

Every panel is a pure function `xxxHtml(state, view): string` rendered into
the existing `Overlay` (`#overlay > .panel`). Buttons carry `data-*`
attributes; the controller dispatches on them. Action vocabulary (attribute →
meaning):

```
data-close                close the panel
data-open="board|orders|market|vet|fair|codex|tree|help|settings|title"
data-sheep="id"           open sheep card
data-findmate="id"        open forecast for sheep
data-mate="id"            select candidate in forecast
data-goal="blue|learn|fine|heavy"
data-plan="ewe:ram"       toggle plan
data-buy="id" / data-sell="id" / data-hire="1" / data-upgrade="paddock|dog|barn|shearing|meadow"
data-test="sheepId:locus"
data-accept="orderId" / data-decline="orderId"
data-enter="sheepId"      fair entry (or "none")
data-sleep="1"
data-rename="id"          prompts for a name
data-newgame="seed?"      start over
data-tab="…"              panel-local tab switch (view state kept by controller)
```

Panels: `titleHtml`, `helpHtml`, `sheepCardHtml`, `forecastPanelHtml`
(existing, extended with visiting ram + rosette + numbers), `boardHtml`
(goal card, planned matings, diary), `ordersHtml`, `marketHtml` (buy/sell +
visitor hire with forecast), `vetHtml`, `fairHtml`, `codexHtml` (discovery
cards collection + concept cards per act), `treeHtml` (family tree),
`reportHtml` (season reveal: lambs vs the forecast the player saw, orders,
fair, event, discoveries, act advance), `endingHtml`, `settingsHtml`.
HUD: `hudHtml(state)` — season, coins, flock n/cap, reputation, current goal
one-liner with progress, a Sleep button, quick buttons for shed/market.

Tone: warm, short sentences, no jargon before its act. Genetics words only via
discovery/concept cards.

## 6. Controller (Stream D) — `packages/game/src/app.ts`

- Boots: reads URL params, loads save (localStorage `blue-sheep-save-v2`) or
  shows title. Builds `WorldView`, renders HUD, subscribes clicks.
- **Deep links** (needed by probes and screenshots):
  `?seed=N` new game with seed (ignores save, does not overwrite it until the
  player acts), `?panel=<name>` open a panel on boot, `?act=N` new game
  fast-forwarded to act N with a fixture flock (debug), `?nomotion=1` disable
  animation, `?fresh=1` clear save.
- **Probe hook**: `window.__game = { state(): GameState, act(action: Action): void, snapshot(): WorldSnapshot, version: string }`
  where `Action` mirrors the core actions:
  `{type:"plan", ewe, ram} | {type:"sleep"} | {type:"buy", id} | {type:"sell", id} | {type:"test", id, locus} | {type:"accept", id} | {type:"enter", id} | {type:"hire"} | {type:"upgrade", id} | {type:"newGame", seed} | {type:"open", panel} | {type:"close"}`.
  Also sets `document.body.dataset.ready = "1"` when the first frame has
  rendered and `document.body.dataset.panel = <open panel name or "">`.
- Sleep flow: world.sleepTransition() → core.advanceSeason → world.setSnapshot
  → world.dawn() → report panel; celebrate() for blue lambs and discoveries.

## 7. Probe (Stream P) — `npm run probe`

Builds the game, serves `dist` on a fresh port, runs Playwright against
headless Chrome (`/usr/bin/google-chrome`, `--use-gl=swiftshader`), and:

1. Boots `?seed=7&fresh=1&nomotion=1`, waits for `body[data-ready]`, asserts no
   console errors, screenshot `probe/out/01-boot.png`.
2. Opens forecast for the first ewe via `__game.act({type:"open",panel:"forecast"})`
   or clicking, screenshot.
3. Plans a mating, sleeps, asserts `state().stats.lambsBorn >= 1` and a lamb
   with `born === season` exists, screenshot the report.
4. Plays 12 seasons with a simple greedy policy through `__game.act`, asserting
   after each: no console errors, money ≥ 0, flock ≤ cap, every accepted
   order resolves by its deadline, act only increases.
5. Deep-links every panel and screenshots each for visual review.
6. Records a 10 s webm of the idle world.

Exit code non-zero on any failure; prints a one-screen summary. Artifacts in
`packages/game/probe/out/` (gitignored).

## 8. Settled details (from the probe stream)

- `open` action accepts an optional `id`: `{type:"open", panel:"forecast", id?: sheepId}`;
  without `id`, forecast opens for the first adult ewe, `sheep` opens the first
  flock sheep. `?panel=sheep` and `?panel=report` must render without extra params.
- `Order.deadline` is an **absolute season index**.
- Flock cap field is `state.flockCap` (kept from v1).
- Illness is flagged as `sheep.ill: boolean` (true → misses breeding this season);
  the event record also names the sheep.
- `state().stats.lambsBorn` must exist and increase when lambs are born; lambs
  have `born === state.season` after the sleep that produced them.
- `window.__game.forecast = { cross(ewe, ram), order(id), fair(id) }` is required
  (thin wrappers over core forecast functions) so the play probe can act.
- Readiness: `document.body.dataset.ready = "1"` after the first rendered frame;
  `document.body.dataset.panel` mirrors the open panel name or `""`.
- Panel names the probe deep-links: title, help, sheep, forecast, board, market,
  settings, report (any act); orders, vet, codex (act ≥ 1); fair (act ≥ 2);
  tree (act ≥ 3); ending (act 4 via `?act=4`).
- Chrome needs `--enable-unsafe-swiftshader` (already in the probe harness).
- Act numbering: `state.act` and `?act=N` use the core index 0–4. Every player-facing
  label (HUD goal pill, board goal card, report act banner) shows it 1-based, so core
  act 1 reads "Act 2 · Hidden colours". `?act=N` plays a few greedy seasons from
  `newGame(seed)` and enters each act on the way (`src/debug.ts`), so the panels have
  lambs, pedigree, orders and fair history to show.
- The farmhouse and the shed hotspots both open the board (planned matings + Sleep);
  the HUD Sleep button sleeps directly. Mailbox → orders, fairground → fair, vet → vet,
  market → market. Locked buildings show a toast instead of an empty panel.

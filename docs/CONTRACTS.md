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
  (one lamb lost unless the flock has an adult with boldness ≥ 7 or a dog sees
  it off; the `barn` improvement stops hard-winter illness), `woolBoom`
  (one colour's wool price ×2 next season, announced in advance so it is a
  decision), and from act 2 (`WOLF_MIN_ACT`, core index) `wolf` (like the fox,
  but a bold sheep doesn't help and only a strong dog does). Predators
  (`core/events.ts`): every owned dog keeps watch, strongest first; each sees the
  predator off with its `DOG_GUARD` chance × `petEffort` (0.9 → 1 with fondness);
  `predatorRisk(state, kind, dogs?)` = the chance a lamb is taken if it comes
  (0 for a fox with a bold adult; otherwise Π(1 − each dog's chance)).
  `EventRecord.dog` names the dog that saved the lambs.
- **Mice** (`core/mice.ts`): from act 1, each new season has a `MICE_CHANCE`
  (25 %) chance that mice are announced for the season after (`state.mice` =
  that season; one at a time). When they come they spoil `MICE_WOOL` (20 %) of
  the clip and eat `MICE_FEED` coin of hay a head, both × (1 − the cat's catch:
  `CAT_CATCH_FLOOR` 0.75 → 1 with the cat's fondness). `SeasonReport.mice`
  reports it; `SeasonReport.miceComing` the announcement.
- **Fondness** (`core/care.ts`): one player-facing measure, "Fondness", 0–100 per
  animal (flock sheep and owned dogs/cat) in `state.care: Record<id, {level,
  greeted, treated, cared}>` (optional; missing records use a default by origin:
  founder 30, market/visitor 10, farm-born lamb 40 + 0.3 × its dam's, a new dog or
  cat 20). Opening an own animal's card greets it: +8 once per animal per season
  (`greetAnimal`). A treat (`giveTreat`, data-treat) costs 1 coin, +15, once per
  animal per season, with `forecastTreat` shown before the button. Ignored for 2+
  seasons: −4 a season (`seasonCare`, end of each season; records of sheep that
  left are dropped). Effects: wool price × `fondWoolMultiplier` (1 from 20 to 40,
  up to ×1.15 at 100, down to ×0.92 at 0), reported as `SeasonReport.fondBonus`
  ("Happy sheep: +N coins this shearing"); dogs guard and the cat catches a little
  better. Words by 20s: Skittish, Wary, Friendly, Fond of you, Devoted; five hearts;
  the number /100 only with `numbers`.
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
  farm) before the Buy button. `paddock` (+4 flock cap), `barn` (nobody falls
  ill in a hard winter), `shearing` (wool ×1.25; the report shows
  `SeasonReport.shedBonus`), `meadow` (+6 cap, act 3+, needs `paddock`), and the
  animals (`PetId`, shown first as "Dogs and a cat"):

  | id | name | price | from | fox | wolf | eats/season |
  |----|------|-------|------|-----|------|-------------|
  | `terrier` | Pip, a yappy terrier | 40 | act 1 | 0.5 | 0 | 1 |
  | `collie` | Bess, a border collie | 90 | act 1 | 0.9 | 0.3 | 2 |
  | `maremma` | Samson, a Maremma guardian dog | 180 | act 3 (core 2) | 0.95 | 0.9 | 3 |
  | `cat` | Mog, a farm cat | 45 | act 2 (core 1) | — | — | 1 |

  Dogs join (each one bought keeps watch with the others). Their market cards show
  `forecastUpgrade(state, id).risk` = the odds a fox / a wolf gets a lamb, now and
  with that dog (risk meters, words; % only with numbers); the cat's shows `.mice`
  (coins a mouse season costs now and with the cat). Pet food (`PET_FEED`) is on
  the feed bill. Stored in `state.upgrades: UpgradeId[]`
  (optional; saves without it load as `[]`; an old save's `"dog"` loads as `"collie"`). Cap bonuses stack on top of each
  act's cap. `buyUpgrade(state, id)` throws a player-readable message when
  already owned, too early, missing its prerequisite, or unaffordable.
- **Discovery cards**: everything learned about one sheep in one update is a
  single card (`Discovery.loci` lists every locus on it; `locus` is the first).
- **Ageing**: adults at 2 seasons, ewes breed until age 20, death at 24.
- **Litter rule**: a valid planned mating always produces ≥1 lamb unless the
  ewe is ill; twins possible. (The "no lamb" bug must not return.)
- **Tutorial** (`core/tutorial.ts`, `ui/tutorial.ts`): new games from the title start in it unless the
  player skips. `newTutorialGame(seed)` is `newGame(seed)` with its starter flock held back
  (`state.tutorial.held`) and one white ewe and one white ram instead. Both carry hidden colour and are
  black underneath; the ewe also carries one dilute copy and the ram none, so no tutorial lamb is blue. Their
  genomes come from a separate RNG (`seed ^ 0x7a11`), so the main RNG, market and money equal
  `newGame(seed)`'s. Only while the tutorial runs, the pair's first mating gives a single lamb, and meiosis
  is rerolled with the game RNG until that lamb is coloured (not white, not blue). That makes the first
  reveal a sure surprise, and it proves both parents carry hidden colour (two discovery cards). Ten steps, one idea each:
  ewe → ram → forecast → plan → sleep → reveal → grow → market → goal → done. Each advances on the real
  action (`tutorialStepMet(state, view)` after every controller render), except `goal` and `done`, which
  have a "Got it" button. Entering `market` tops up coins if the cheapest ewe is unaffordable
  (`tutorial.gift`). Entering `done` hands over the held flock: the very sheep of `newGame(seed)`, same ids,
  genomes and ages (birth seasons shift by the seasons the tutorial took). **Acts are not held.** The
  tutorial *is* act 0: its mating produces the first lamb, so the sleep in step 5 enters act 1 ("Hidden
  colours") exactly as a normal game does, and the handover then happens in act 1. From there acts,
  balance and oracle numbers follow the normal rules (the farm just has four extra sheep). `skipTutorial`
  hands over at once. `state.tutorial` is `null` for games without it (skipped at the title, `?seed=`,
  `?act=`, old saves).

## 2. Paths and ownership

```
packages/game/src/core/      Stream A: state, sim, acts, orders, fair, events, vet, market, economy, knowledge
packages/game/src/world3d/   Stream B: Three.js diorama (WorldView)
packages/game/src/ui/        Stream C: HTML panels (pure functions of state) + CSS
packages/game/src/audio/     Stream D: sheep voices (pure voice mapping + WebAudio bleat synth), no core imports
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
export function buyUpgrade(state, id): void;                // farm improvement or animal (see §1)
export function greetAnimal(state, id): number;             // fondness gained (0 if already greeted this season / not yours)
export function giveTreat(state, id): number;               // 1 coin, once per animal per season; throws otherwise

// tutorial (see §1)
export function newTutorialGame(seed: number): GameState;
export function advanceTutorial(state, stepId): boolean;     // no-op unless stepId is the current step
export function skipTutorial(state): void;
export function tutorialInfo(state): { step: number; id: TutorialStepId; done: boolean } | null;
export const TUTORIAL_STEPS: { id; title; ack }[];            // 10 steps, 1-based in state

// forecasts (knowledge-limited; all pure)
export function forecastCross(state, eweId, ramId): CrossForecast;   // existing shape + keep
export function candidates(state, forId): Sheep[];
export function forecastOrder(state, orderId): { pFill: number; text: string };
export function forecastFair(state, sheepId): { pWin: number; pPlace: number; text: string };
export function forecastVet(state, sheepId, locus): { gainBits: number; text: string };
export function forecastUpgrade(state, id): { text; risk?: { fox: {now, with}; wolf: {now, with} }; mice?: { now, with } };
export function forecastTreat(state, id): { before; after; woolBefore; woolAfter; text };
export function predatorRisk(state, "fox" | "wolf", dogs?): number;  // chance a lamb is taken if it comes
export function fondnessOf(state, id): number;              // 0–100, sheep id or PetId
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
`tutorial: { step, done, ewe, ram, held: Sheep[], gift } | null` (absent in older saves → `null`),
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
  personality?: "shy" | "calm" | "curious" | "bold"; // idle behaviour + greeting (default calm)
  dam?: string | null;  // lambs stay near their mother
  fondness?: number;    // 0–100 (default 30): 60+ come to the front and follow the visited sheep; <20 back away
}
export interface WorldSnapshot {
  season: 0 | 1 | 2 | 3;      // spring..winter: light, foliage colour, snow in winter
  year: number;
  sheep: WorldSheep[];
  selected: string | null;
  paddock2: boolean;          // second paddock fenced & open
  visitorPresent: boolean;    // visiting ram pen occupied
  fairToday: boolean;         // bunting on the fairground
  upgrades?: string[];        // owned: "terrier" | "collie" | "maremma" (dogs; old "dog" = collie), "cat", "barn", "shearing", "meadow"
  pets?: { id: PetKind; name: string; fondness?: number }[];  // hover names of the dogs and cat
}
export interface WorldHandlers {
  onSheep(id: string): void;
  onHotspot(h: Hotspot): void;
  onHover?(target: { kind: "sheep"; id: string } | { kind: "hotspot"; id: Hotspot } | null): void;
  onPortraitClick?(id: string): void; // the live portrait was clicked (it hops); the controller plays the voice
  onPet?(id: PetKind): void;          // a dog or the cat was clicked in the field (PetKind = terrier|collie|maremma|cat)
}
export class WorldView {
  constructor(container: HTMLElement, handlers: WorldHandlers, opts?: { seed?: number; reducedMotion?: boolean });
  setSnapshot(s: WorldSnapshot): void;  // diff: new sheep pop in with a little bounce; removed fade out
  portrait(sheep: WorldSheep, px?: number): string; // PNG data URL of that sheep on a pastel background
  celebrate(id: string): void;         // sparkles/confetti above a sheep
  focus(id: string | Hotspot): void;   // glide camera
  screenPoint(id: string | Hotspot): { x: number; y: number; inView: boolean } | null;
    // client px just above a sheep's head (or a hotspot's anchor); the tutorial's arrow points there
  attend(id: string | null, opts?: { offsetPx?: number; say?: string }): void;
    // visit a sheep (its card is open): camera glides in beside it (shifted left by offsetPx for a
    // right-hand card), it stops, turns to the camera, flicks its ears, hops or tilts its head and
    // says hello in a speech bubble chosen by personality. null releases it and restores the camera.
  mountPortrait(el: HTMLElement, sheep: WorldSheep): () => void;
    // live animated 3D portrait (own small renderer, canvas[data-live-portrait]) inside el; one at a
    // time; mounting the same sheep again moves the canvas. The disposer stops rendering.
  love(id: string, n?: number): void;  // pink hearts float up from a sheep, dog or cat (greeted / treated)
  say(id: PetKind, text: string): void; // speech bubble over a dog or the cat
  petPortrait(id: PetKind, px?: number): string; // PNG data URL of a dog or the cat sitting (animal card)
  sleepTransition(): Promise<void>;    // dusk → night → dawn, ~1.5 s, resolves at darkest point? No: resolves when fully dark; call again with dawn(): Promise<void>
  dawn(): Promise<void>;
  resize(): void;
  dispose(): void;
}
```

Personality greetings (`BLEATS`, first line is the greeting): shy "…", calm "Mehh.", curious "Baa!",
bold "BAA!". In the field shy sheep keep to the fence and hop back from a fuss, bold ones roam wide and
come to the front, curious ones walk over to the sheep being visited. Everyone grazes, looks about,
nuzzles, lambs skip after their dam, and the flock lies down at night. Legs, ears and eyes are
instanced flock-wide (three draw calls). Reduced motion: static poses, instant camera, static bubble.
Farm animals (`dog.ts`, `cat.ts`): Pip the terrier (small, scruffy white with tan patches, a beard, upright
ears) darts about; Bess the collie (black and white) trots round the flock and sits to watch; Samson the
Maremma (big, cream-white, droopy ears, plumed tail) lies among the flock and patrols slowly. All three watch
the visited sheep from their own side and sleep by the gate at night. Mog the cat (orange tabby) naps and
grooms on the barn roof, jumps down via the hay bales, stalks and pounces on the barn floor, naps in the sun,
and curls up on the roof at night. Each has an invisible pick box (`userData.pet`), so it can be hovered
(label) and clicked (`onPet`). `screenPoint`/`focus` accept a PetKind. Fondness in the field: 60+ trot to the
front and come over to the visited sheep; under 20 keep to the fence and hop back when visited (or when a
neighbour is); 80+ add "♥" to their greeting.
`debugStats()` (not contract) reports draw calls, the dogs (`dog`, `dogs[]`), `cat`, live `hearts`, the visited sheep, the bubble and the portrait.

Sheep look (`sheepMesh.ts`): chibi proportions. A round body made of overlapping wool puffs around a
soft core (crimp → more, smaller, lumpier puffs; fleece weight → bigger puffs; size → body scale; spots
colour whole puffs), a big head (×1.68 adults, ×2.1 lambs) with a wool bonnet and top tuft, a lighter
round muzzle, rosy cheeks, big eyes (white, dark iris, highlight dot; one vertex-coloured instanced
geometry in the world, a movable iris in the live portrait), floppy ears, short stubby legs with little
hooves, a two-puff tail, small round horn curls (bigger on rams).

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
data-buy="id" / data-sell="id" / data-hire="1" / data-upgrade="paddock|terrier|collie|maremma|cat|barn|shearing|meadow"
data-treat="id"           give a sheep in the flock, or an owned dog/cat (PetId), a treat (1 coin)
data-open="animal" data-sheep-id="terrier|collie|maremma|cat"   the animal card
data-test="sheepId:locus"
data-accept="orderId" / data-decline="orderId"
data-enter="sheepId"      fair entry (or "none")
data-sleep="1"
data-rename="id"          prompts for a name
data-newgame="seed?"      start over
data-tab="…"              panel-local tab switch (view state kept by controller)
data-tutorial="start|ack|skip"  new tutorial game / the mentor's "Got it" / skip the tutorial
data-toggle="motion|sound"      settings switches (reduced motion, sheep voices)
data-volume               settings' volume slider (<input type=range>, 0–100; input/change, no re-render)
```

Tutorial UI (`ui/tutorial.ts`): `mentorHtml(state, view)` is a card docked bottom-left (`#mentor`, above
the overlay). While it is shown, centred panels are pushed right to make room for it. It shows Old Tom
(👴, from `VILLAGERS`) with one short idea per step, and Granny Moss (👵) at the handover.
`tutorialTarget` names what to point at: a world sheep (it gets the "selected" ground ring and a bobbing
arrow at `screenPoint`) or HTML selectors (a pulsing `.tut-ring`, and the arrow on the first one, from the
left for panel buttons). The HUD's goal pill tracks the tutorial until the goal step. The title offers
**Start with the tutorial** (primary) and **Skip tutorial**, and settings has **Replay the tutorial…**
(behind a confirm).

Presentation rules: one odds meter everywhere (`oddsMeter`/`pips`: ten segments, the odds in words,
a "long shot · likely · sure" scale, % only with numbers) and the same look for learning
(`learnMeter`, "little → loads"). Forecast litters draw ten lamb portraits from `view.lambArt`
(controller → `WorldView.portrait` of a synthetic lamb), CSS blobs without it. Range bars have an axis
in words, parents' portrait pins, flock and expected-lamb markers and an explained band. The sheep card
is a right-docked side panel (`SIDE_PANELS`) with a `[data-live-portrait-slot]` the controller mounts
the live portrait into, plus a personality line (`personalityLine`, core/personality.ts, from boldness
and looks only). The report flips each born lamb card next to the forecast it matched. The family tree
is an SVG-connected tree with portrait nodes. `actTrack` draws the five acts in the board and HUD.

Care UI: `heartMeter` (five hearts, the word, faint hearts for what a treat would add, /100 only with
numbers). The sheep card (own flock sheep only) and the animal card have a care box: Fondness hearts,
"♥ said hello this season", what fondness does to its wool (coins; % with numbers), the treat forecast and
"Give a treat · 1 coin" (or "Treat given ✓"). `animalCardHtml` (panel `animal`, a right-docked side panel
like the sheep card): portrait from `view.petArt(id)`, what the dog does (fox/wolf risk meters with all your
dogs) or the cat does (mice caught, mice coming), the care box, and the other animals. Risk meters use
`oddsMeter(..., {risk: true})` (warm colours). The report adds "💗 Happy sheep: +N coins this shearing" (or
"😟 Skittish sheep: −N"), 🐭 mice, 🐺 wolf and "Good dog, <name>!" when a dog saved the lambs. The board's
"Coming up" lists mice and "Your animals" (chips with hearts).

Panels: `titleHtml`, `helpHtml`, `sheepCardHtml`, `animalCardHtml`, `forecastPanelHtml`
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
  player acts), `?tutorial=1` a new tutorial game (with `?seed=N` if given; not saved until the player
  acts; `?tutorial=0` or no param keeps the normal start), `?panel=<name>` open a panel on boot, `?act=N` new game
  fast-forwarded to act N with a fixture flock (debug), `?nomotion=1` disable
  animation, `?fresh=1` clear save.
- **Probe hook**: `window.__game = { state(): GameState, act(action: Action): void, snapshot(): WorldSnapshot, version: string }`
  where `Action` mirrors the core actions:
  `{type:"plan", ewe, ram} | {type:"sleep"} | {type:"buy", id} | {type:"sell", id} | {type:"test", id, locus} | {type:"accept", id} | {type:"enter", id} | {type:"hire"} | {type:"upgrade", id} | {type:"treat", id} | {type:"newGame", seed} | {type:"open", panel, id?} | {type:"close"} | {type:"tutorial", op:"start"|"ack"|"skip", seed?}`.
  Opening an own sheep's card (`open` sheep) or an animal's card (`open` animal with a PetId) greets it
  (fondness, once per season; hearts in the field; saved). The animal card also glides the camera to the
  animal, which speaks (bubble + bark/mew).
  `window.__game.tutorial()` returns `{ step, id, done }` or `null` (no tutorial). `body[data-tutorial]`
  holds the running step number, or `""`.
  Also sets `document.body.dataset.ready = "1"` when the first frame has
  rendered and `document.body.dataset.panel = <open panel name or "">`.
  `window.__game.debug.world()` (not contract) returns `WorldView.debugStats()` for probes.
  Also (not contract): `debug.lastSound()` (the last bleat's voice params, `steps`, `played`, `reason`
  = `muted | locked | no-audio | busy`), `debug.voiceOf(id)` and `async debug.renderVoice(id | VoiceInput,
  "one" | "random")` (offline render: `{ voice, steps, sampleRate, samples }`).
- Fondness in voices: `voiceFor({..., fondness})` warms a flock sheep's delivery (smoother, less breathy, a
  little rising, and sometimes an extra happy bleat) without changing pitch, vowel or length.
  `petVoiceFor(kind, fondness)`: terrier yap-yap(-yap) ~560 Hz, collie woof(-woof) ~340 Hz, Maremma one deep
  WOOF ~175 Hz, cat "mrrp? mew" ~540 Hz; `Voice.species` is "dog" | "cat".
  Hook extras (not contract): `debug.fondness(id)`, `debug.petPoint(id)`, `forecast.upgrade(id)`.
- Voices (`src/audio/`): `voiceFor({id, sex, adult, ageSeasons, size, personality})` is pure and stable per
  sheep (lamb > ewe > ram in pitch, bigger = a little lower, per-id variation; shy soft/breathy/falling
  "meh", calm steady "baaa", curious rising and often double, bold loud/rough/long, sometimes "BAA-A-A").
  The controller plays a sheep's voice when its card opens (world click, list, tutorial meetings), when
  the live portrait or the already-visited sheep is clicked, and a soft chorus of up to four new lambs
  when the season report opens. The AudioContext is created only inside a user gesture; at most four
  bleats overlap and one sheep can't repeat within 350 ms. Settings has **Sheep voices** on/off and a
  volume slider (`localStorage` `blue-sheep-sound`, `blue-sheep-volume`; not game state).
- Sheep card life: after every render, if the sheep card is open the controller mounts the live
  portrait into `[data-live-portrait-slot]` and calls `world.attend(id, {offsetPx})`; otherwise it
  stops the portrait and calls `world.attend(null)`.
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
6. Life (`life.mjs`): the sheep card mounts exactly one live portrait canvas and the world visits that
   sheep; switching cards moves it; close/Escape unmount it; the forecast never has one. With motion
   on (all four animals bought) it saves frame sequences
   (`life-world-*`, `life-close-*`, `life-sheep-*`, `life-report-*`, `life-night`) and notes fps and
   draw calls. Voices: a lamb, a ewe and a ram (card open, then a real click on the portrait) have three
   different voices with pitch lamb > ewe > ram and stay stable; a shy sheep is softer, smoother and
   shorter than a bold one; with the settings toggle off a click plays nothing (`reason: "muted"`).
6a. Care (in `life.mjs`): at act 3 the dogs/cat in the world match the owned ones; buying the collie lowers
   the Maremma card's "a wolf gets a lamb now" forecast and meter; the cat's card forecasts cheaper mouse
   seasons; after buying all four they are in `snapshot().upgrades`/`pets` and the world (`dogs`, `cat`); each
   animal card greets it and it speaks (barks terrier > collie > Maremma in pitch). Greeting a sheep raises
   fondness once per season (a second greeting the same season does not; next season it does) and floats
   hearts; a treat costs exactly 1 coin, gives more than a greeting and is refused the second time. A staged
   season shows "Happy sheep: +N", a wolf and mice in the report. Screenshots `care-*` (sheep card, treat,
   market pets, each animal card, report, and motion close-ups `care-close-<pet>-*`).
6b. Voices (`voices.mjs`): renders lamb/ewe/ram × shy/calm/curious/bold offline in the real build,
   measures length, peak/RMS level and pitch (YIN), asserts measured pitch lamb > ewe > ram per temperament
   and near the designed pitch, lambs shorter than rams, shy ≥ 3 dB quieter than bold, and writes
   `out/voices/*.wav` plus `stats.txt` for a human to listen to.
7. Tutorial (`tutorial.mjs`): boots `?tutorial=1&fresh=1&nomotion=1` and plays all ten steps with real
   clicks (world sheep are clicked where the arrow points; `open` is only a fallback). It asserts that each
   step advances on its action, that the mentor card never covers a ringed target, the arrow's tip or the
   panel's primary button, that the first lamb is coloured and earns a discovery card, that the market step
   buys a ewe, and that the end flock is `?seed=<same>`'s starter flock plus the four tutorial sheep. It
   also checks skipping and that `?seed` alone has no tutorial. Screenshots `tut-01`…`tut-10`,
   `tut-04-1024`, `tut-end`.
8. Records a 10 s webm of the idle world.

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
- Panel names the probe deep-links: title, help, sheep, animal, forecast, board, market,
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

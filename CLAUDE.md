# Blue Sheep

Blue Sheep is a cozy, turn-based sheep-breeding game built on realistic genetics. The player predicts what a mating will produce, breeds, and uncovers hidden alleles, working toward a blue sheep and then a breed of their own. It is a TypeScript monorepo (npm workspaces, Vite, vitest, Three.js).

## Docs: read before you edit

- `docs/DESIGN.md`: design intent and the validated forecast-panel pattern. Read it before changing gameplay or UI.
- `docs/DESIGN-v3.md`: the v3 design (pigment colours, breeds, woolshed crafting, market demand, native birds, river valley, Golden Fleece) and its phased plan. Read it before any v3 phase; it is the target where it and CONTRACTS.md disagree.
- `docs/CONTRACTS.md`: the v1 build contracts, including the core API, world API, panel names, deep links, `window.__game` and the probe spec. Read the section for the path you are about to touch.
- `docs/AGENT-WORKFLOW.md`: why verification works the way it does here.
- `packages/game/probe/README.md`: the probe harness, and how to add a probe.

## Commands (repo root)

- `npm test`: vitest, covering genetics statistics, inference and sim determinism.
- `npm run typecheck`: `tsc -b` across all packages.
- `npm run build`: production build into `packages/game/dist`.
- `npm run probe`: builds, then runs smoke → play (12 seasons) → panels → life (live portrait, sheep visits, sheepdog, voices) → voices (offline-rendered bleats, stats and WAVs in `out/voices/`) → tutorial (all seventeen steps over three lambings by real clicks, `tut-01..17.png`) → lessons (the pacing calendar to Year 4, each concept's Old Tom mini-lesson, the vet lesson by real clicks, `lesson-*.png`, forecast layout at 1280×800 and 1024×768) → 10 s video in headless Chrome. Artifacts go to `packages/game/probe/out/`.
- `npm run probe:quick`: builds, then runs smoke only. Run it after every change that touches the game.
- `npm run probe:shot -- "?seed=7&panel=vet" vet`: builds and screenshots one deep link to `probe/out/vet.png`.
- `npm run serve`: builds and serves the production game on `0.0.0.0:4173` for a human.
- `npm run dev -- --host`: Vite dev server for a human.
- `npx vite-node packages/game/scripts/<name>.ts`: oracle and balance sims, e.g. `blind.ts` (knowledge-limited farmer: seasons per act and ending rate over 30 seeds) or `oracle.ts`.
- `npx vite-node packages/genetics/scripts/palette.ts --png`: the v3 colour palette sheet, breed table and a selective-breeding sim, written to `packages/genetics/out/` (gitignored). Open `palette.png` with Read after any colour-model change.

The user works on a different machine. When you start a server for them, bind to all interfaces (`--host` / `0.0.0.0`). Report `http://<first IP from hostname -I>:<port>`, not `localhost`, and leave the server running in the background.

## Packages and ownership

```
packages/genetics/          pure TS: genome, meiosis, traits, pedigree, createRng; v3: sheep3, colour, breeds, wooltype
packages/inference/         pure TS: posteriors, lamb outcome distributions, info gain
packages/game/src/core/     state, sim, acts, orders, fair, events, vet, market, economy, knowledge
packages/game/src/world3d/  Three.js isometric diorama (WorldView); imports nothing from core/
packages/game/src/ui/       HTML panels: pure functions `xxxHtml(state, view): string`
packages/game/src/audio/    sheep voices: pure voice mapping (voice.ts) + WebAudio bleat synth (engine.ts)
packages/game/src/app.ts    controller: wires core + world + ui, deep links, window.__game
packages/game/probe/        Playwright probes and screenshot artifacts
packages/game/scripts/      oracle and balance sims
```

Dependencies flow one way: genetics → inference → core → ui/app. The world gets `WorldSnapshot` data only. During parallel work, edit only the paths your stream owns (CONTRACTS.md §2). If you need something across a boundary, change the contract in CONTRACTS.md and don't reach into the other package.

## Invariants

- **All randomness goes through `createRng`** from `@blue-sheep/genetics`, and the RNG state is stored in GameState. The same serialized state must produce the same `advanceSeason` result. `Math.random` is allowed only for cosmetic animation in world3d.
- **genetics and inference stay pure and UI-free**, with no DOM, no game state and no Three.js.
- **Player-facing text uses plain sentences with confidence dots.** Genotype strings (`B/b`, `D/d`) stay internal: they belong in tests, debug output and the notebook model, never in rendered UI.
- **Forecasts are knowledge-limited.** Compute them from posteriors and farm records (pedigree, phenotypes, vet tests), never from `sheep.genome`.
- **Percentages, h² and distribution curves** appear only when `state.unlocks` includes `"numbers"`. Before that, show icons, range bars and words.
- **Every player choice runs Decide → Forecast → Commit → Reveal → Learn.** Show a forecast before the commit, then show the reveal next to the forecast the player saw.
- **A valid planned mating yields at least one lamb** unless the ewe is reported ill. The play probe asserts this.

## Definition of done

Passing `npm test` and `npm run typecheck` is necessary but not sufficient. A change is done when:

1. `npm run probe` exits 0. For small, local changes, `npm run probe:quick` is enough.
2. You have opened the relevant PNGs in `packages/game/probe/out/` with the Read tool and confirmed they show what you intended. For animation work, check `idle.webm` too.
3. For any UI change, you report the screenshot paths you looked at and what they show.

Probes always build fresh and serve on a new port. Take screenshots through the probe (`probe:shot` for one-offs), never from a long-lived dev or preview server, because those serve stale builds.

For new behaviour, add a probe assertion derived from a game rule, e.g. "a hired ram appears in the flock for exactly one season". Pixel checks don't count. See `probe/README.md`.

## Deep links and the probe hook (details: CONTRACTS.md §6)

- URL params: `?seed=N` (new game with that seed), `?tutorial=1` (new game in the tutorial), `?fresh=1` (clear the save), `?nomotion=1`, `?act=N` (fast-forward to act N with a fixture flock), `?panel=<name>` (open a panel on boot).
- `window.__game = { state(), act(action), snapshot(), tutorial(), version }`. Actions look like `{type:"plan",ewe,ram}`, `{type:"sleep"}`, `{type:"open",panel}` and so on.
- `body[data-ready="1"]` is set after the first frame. `body[data-panel]` holds the open panel name, or `""` when none is open.
- When you add a panel or an action, update CONTRACTS.md, the controller and `probe/panels.mjs` (`PANELS`) together.

## Working style

- Balance tuning happens in `packages/game/scripts/` as a separate pass with oracle sims. Keep it out of feature commits.
- The human playtests for fun, feel and layout. Report what you verified, and flag anything you only inferred.

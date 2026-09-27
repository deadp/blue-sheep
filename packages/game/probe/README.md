# Probes

Behavioural checks that build the real game, serve it, drive it in headless
Chrome and leave evidence (PNG, webm, log) in `probe/out/`. They exist because
passing unit tests do not prove the game runs. Spec: `docs/CONTRACTS.md` §7.

## Commands (repo root)

| Command | What it does |
|---|---|
| `npm run probe` | build, then smoke → play → panels → life → voices → tutorial → lessons → video; summary table; exit 1 on any failure |
| `npm run probe:quick` | build, then smoke only |
| `node packages/game/probe/run.mjs play panels` | build, then just the named steps |
| `node packages/game/probe/<step>.mjs` | one step standalone (smoke, play, panels, life, tutorial, video) |
| `npm run probe:shot -- "?seed=7&panel=vet" vet` | build and screenshot any deep link to `out/vet.png` (`--no-ready` for builds without the controller) |
| `npm run serve` | build and serve on `0.0.0.0:4173` for a human; prints the LAN URL |

`PROBE_NO_BUILD=1` reuses the previous probe build (`probe/.build/`). Use it
only when nothing under `src/` changed since that build.

Every run builds into `probe/.build/` (never `packages/game/dist`), serves on
a fresh port, and kills the server and browser on exit, Ctrl+C or crash.
Don't point a probe at a long-lived dev server. Stale builds give you
screenshots of old code.

## Steps

- **smoke.mjs**: boots `?seed=7&fresh=1&nomotion=1` (`01-boot.png`). Opens the
  forecast for the first adult ewe (`02-forecast.png`). Plans that ewe with the
  first adult ram, sleeps, and asserts `stats.lambsBorn >= 1` and a flock sheep
  with `born === state().season` (`03-report.png`).
- **play.mjs**: plays 12 seasons with a greedy policy using only `__game.act`
  and `__game.state`. After every sleep it asserts: no console errors;
  `money >= 0`; `flock.length <= flockCap`; `act` never goes down; no accepted
  order is still open past its `deadline`; and if any mating was planned, a lamb
  was born unless illness or loss was reported.
- **panels.mjs**: deep-links each panel in `PANELS` (`?panel=<name>`, plus
  `&act=N` for gated panels), waits for `body[data-panel=<name>]`, and
  screenshots `panel-<name>.png`. Fails on console errors.
- **life.mjs**: the sheep card's live portrait and the world's visit. Asserts one
  `canvas[data-live-portrait]` in the open sheep card, that switching cards moves
  it, that closing (button, `close` action, Escape) removes it and releases the
  sheep, and that the sheepdog is drawn exactly when the dog improvement is owned
  (`__game.debug.world()`). With motion on it saves 6-frame sequences 300 ms
  apart (`life-world-*`, `life-close-*` zoomed in, `life-sheep-*`,
  `life-sheep-bleat`, `life-night`, `life-report-*`) and notes fps and draw calls.
  Voices: opening a card and clicking the portrait of a lamb, a ewe and a ram gives three different
  voices (`__game.debug.lastSound()`), pitch lamb > ewe > ram, stable per sheep; shy is softer, smoother
  and shorter than bold; the settings toggle mutes. Brushing (press and hold): a short press does nothing
  and its ring goes away; a full hold (~1.2 s) raises fondness by 6 once a season ("Brushed this season"),
  with a filling ring, tufts and hearts (`brush-hold-1`, `brush-ring`, `brush-fluff.png` read back from the
  canvas mid-hold); holding the collie's picture pats her, a short press does not.
- **voices.mjs**: we can't listen headless, so it renders lamb/ewe/ram × shy/calm/curious/bold bleats
  offline (`__game.debug.renderVoice`), measures length, peak/RMS and pitch (YIN), asserts the ordering,
  and writes `out/voices/*.wav` (plus `series-*.wav`, the 1–3 bleat series as played) and `stats.txt`.
- **tutorial.mjs**: boots `?tutorial=1&fresh=1&nomotion=1` and plays all seventeen
  tutorial steps (three lambings of the same pair) with real clicks. World sheep are
  clicked where the tutorial's arrow points, with `open` as a fallback that the
  summary reports. It asserts that each step advances on its action and that the
  mentor card never covers a ringed target, the arrow's tip or the panel's primary
  button; lamb 1 is white and polled (no card, no codex), lamb 2 is white and
  horned (the first card, the codex), lamb 3 is black (colour cards, act 1); the
  Punnet square appears only after lamb 2, shows 3 polled : 1 horned with no
  letters, lights copies/cells on hover and click and fits at 1280×800 and
  1024×768; a ewe is bought; no handover; "Let's farm!" brings the horns letter and
  its lesson at once; the next season (Year 2 Spring) brings only the vet. Skipping
  is checked too. Screenshots: `tut-01..tut-17.png`, `tut-10-hover`, `tut-10-pick`,
  `tut-10-1024`, `tut-end`, `tut-codex`, `tut-after`.
- **lessons.mjs**: the pacing calendar and Old Tom's mini-lessons from `?seed=11`
  to Year 4: each concept arrives alone on schedule (vet Y2 Spring, improvements Y2
  Autumn, dogs Y3 Spring, cat Y3 Autumn) with its lesson; no fox before dogs; the
  orders, vet, farm, dogs and cat lessons are completed by real clicks; a lesson
  resumes after a sleep; the forecast keeps ten lambs on one row and long names
  clear of the hint at 1280×800 and 1024×768. Screenshots `lesson-*`, `forecast-*`.
- **video.mjs**: records 10 s of the idle world with motion on to `idle.webm`.
  Watch it for flicker and jitter.

When a step fails, the harness saves `<step>-FAILED.png`. The full browser
console is in `out/log.txt`.

## Contract the game must meet

Defined in `docs/CONTRACTS.md` §6. In short:

- `document.body.dataset.ready = "1"` once the first frame has rendered, within 20 s.
- `document.body.dataset.panel` = the open panel name, or `""` when none is open.
- `window.__game.state()` returns the GameState; `window.__game.act(action)`
  dispatches an action and throws a player-readable Error when the move is
  illegal. The probe treats a thrown Error as a refused move, not a failure. Any
  `console.error` or uncaught exception is a failure.
- Optional: `window.__game.forecast = { cross(ewe, ram), order(id), fair(id) }`.
  When it exists, play.mjs picks rams by P(blue) and accepts orders with
  `pFill >= 0.5`.

## Adding a probe

1. Create `probe/<name>.mjs` that exports a `Step`, i.e. `{ name, run(ctx) }`.
   `ctx.newPage()` returns a `GamePage` (`boot`, `act`, `state`, `waitPanel`,
   `waitState`, `screenshot`, `assertNoErrors`). Use `ctx.artifact(path)` and
   `ctx.note(text)` to add lines to the summary. Throw `ProbeError` to fail.
2. End the file with `if (isMain(import.meta.url)) runSteps([step]);`.
3. Register it in `ALL` in `run.mjs`.
4. Derive expectations from game rules, such as "a planned mating yields a
   lamb". Don't assert pixel values. Screenshots are for a human, or an agent
   using the Read tool, to look at.

# How to build this game with coding agents

Research notes, September 2026. Sources at the bottom. The point of this doc is
to change how we work, so every section ends with what we actually do.

## 1. Stack: text-first engines win, and we already have one

The consistent finding across 2026 write-ups is blunt: **LLMs manipulate text, so
the engines they help most are the ones that are text.** Godot (scenes, scripts,
resources and project settings all serialise to text) and web stacks
(Three.js / Phaser / Canvas + Vite) are the two recommended families. Unity's
binary assets and visual-editor-first workflow are a measurable handicap.

The reported sweet spot is exactly our situation: AI tooling delivers large
speed-ups in the **prototype / zero-to-one phase** and on isolated subtasks
(gameplay scripts, procedural generation, shaders, boilerplate). Evidence that it
accelerates experienced developers on **mature, tightly-coupled** game codebases
is weak-to-negative.

**What we do:** stay on TypeScript + Vite. Three.js for the diorama, as planned.
Do *not* move to Godot — it would strand the `genetics` and `inference` packages
in a second language for no agent-productivity gain. Keep the codebase loosely
coupled specifically because that is where agent help stops working.

## 2. The dominant failure mode is *not* writing bad code

The GameXpert-Bench results are the most useful thing I found, because they
separate two skills that feel identical from the outside:

| Situation | Agent performance |
|---|---|
| Bug is described to the agent | Near-ceiling; models compress at the top |
| Bug is present but undisclosed | **Drops 7.6 to 32.8 points** |

This is the **self-discovery deficit**, and it is exactly what happened here: the
"no lamb spawned for me" bug was found by a human playing the game, not by me,
despite 45 passing tests. Related numbers from the same study:

- **5.32%** of features that *look* implemented fail at runtime. 56% of those are
  load/crash failures, 16% wrong state transitions, 13% missing feedback.
- **15.2%** of generated games ship UI misalignment, overlap or occlusion.
- Multi-turn work is unstable: agents author a requested feature correctly and
  then break integration. One cited case was a missing `</style>` tag that made
  an entire game unplayable.

The recommended countermeasure is consistent everywhere: **deterministic
behavioural testing after each modification, not code review.** Agents default to
static inspection and plausibility checks; they need to derive expected values
from game invariants and validate them through execution.

**What we do:** treat "tests pass" as necessary and insufficient. Nothing counts
as done until something has *run the game and observed the outcome*. See §4.

## 3. Process: structure before execution

Anthropic's own testing found unguided attempts succeed about **33%** of the
time; the differentiator is the structure built around the model before
execution starts. The recurring recipe:

1. **A lean `CLAUDE.md`** so the agent stops re-deriving project context every
   session.
2. **Plan mode before any edit** — draft, annotate, send back with "address the
   notes, don't implement yet" until every decision is resolved.
3. **Persistent dev docs** (`plan.md` / `context.md` / `tasks.md`, or in our case
   `DESIGN.md`) to prevent context amnesia across sessions.
4. **Evidence-based completion** — real build output, test results or screenshots
   before anything is marked done.
5. **Task decomposition that matches the failure modes**: separate UI layout from
   mechanics; isolate numerical balance as a final independent pass; break
   multi-turn optimisation into single-dimension requests with regression checks
   between turns.

**Gap in this repo:** there is no `CLAUDE.md`. `docs/DESIGN.md` covers design
intent but not conventions, commands, or the invariants an agent must not break.

## 4. Verification: give the agent eyes, and make them automatic

The tooling pattern that has emerged is "proof artifacts": the agent drives a
real browser, captures screenshots or short video, collects console errors, and
bundles evidence a human can check. Academic harnesses do the same — launch the
game in **headless Chromium via Playwright and run deterministic behavioural
probes**. Video matters for temporal bugs (flicker, animation, race conditions)
that single screenshots miss; 10–15 seconds is the suggested clip length.

What already works well here, and should be kept and formalised:

- **Seeded determinism end-to-end.** Every random draw flows through
  `createRng`, and `sim.test.ts` asserts `serialize(a) === serialize(b)` for the
  same seed. This is what makes behavioural probes possible at all.
- **Pure, UI-free core.** `genetics` and `inference` have statistical tests
  (Haldane recombination rates, 3:1 ratios, F = 0.25 for full sibs, h² recovered
  by midparent regression). These are game invariants validated by execution —
  precisely what the research says agents skip.
- **Oracle simulation for balance.** `packages/game/scripts/reach.ts` plays 30
  seeds with a perfect-knowledge greedy breeder and reports median seasons to a
  blue lamb. That caught the original "unreachable goal" tuning problem.
- **Deterministic deep-links.** `?zoom=` and `?panel=forecast` boot the game
  straight into a UI state for screenshotting, instead of driving input.

What is missing:

- No probe **plays the game**. Nothing boots the app, plans a mating, sleeps, and
  asserts a lamb appeared. That specific probe would have caught the bug the
  human found.
- Screenshots are taken ad hoc by hand, so a stale dev server silently produced
  three rounds of screenshots of an *old build* during this session.
- No regression gate between turns — `npm test` runs, but nothing checks the
  built game still boots.

## 5. What humans should keep doing

The benchmark is explicit that these stay human, and our session bears it out:

- **Autonomous bug discovery** during play. The lamb bug, and both presentation
  U-turns, came from a human playing.
- **UI/UX polish and spatial layout.** The measured weak spot.
- **Numerical balance and difficulty tuning** as a deliberate final pass.
- **Cross-system integration testing.**
- **Creative direction.** The forecast-panel idea came from the human; the agent
  built it well once the direction was set.

## 6. Concrete changes for this repo

1. **Write `CLAUDE.md`** — commands, package boundaries, the invariants
   (all randomness through `createRng`; genetics/inference stay UI-free; no
   genotype strings in player-facing UI), and the rule that a change is not done
   until a probe has run the game.
2. **Add a Playwright smoke probe** (`npm run probe`) that boots the built game
   with a fixed seed, opens the forecast panel, plans a mating, sleeps, and
   asserts a lamb exists — capturing screenshots and console errors as artifacts.
   This directly targets the self-discovery deficit and the 5.32% runtime gap.
3. **Formalise deterministic deep-links**: `?seed=&season=&panel=` so any UI
   state is reachable and screenshottable without input simulation.
4. **Always rebuild or restart the server inside the probe**, never screenshot a
   long-lived dev server. Stale-server screenshots wasted real time this session.
5. **Keep balance tuning in `scripts/`** as oracle sims, run as a separate pass,
   never mixed into feature work.

## Sources

- [GameXpert-Bench: How Far Are Coding Agents from Expert Game Development?](https://arxiv.org/html/2608.21833)
- [GameGen-Verifier: Parallel Keypoint-Based Verification for LLM-Generated Games](https://arxiv.org/pdf/2605.07442)
- [AI Coding Tools for Video Game Development: A First-Principles Analysis](https://chierhu.medium.com/ai-coding-tools-for-video-game-development-a-first-principles-analysis-of-what-actually-works-90dfa10edd13)
- [Unity vs Godot 2026: Which Wins with AI Coding Tools](https://ziva.sh/blogs/unity-vs-godot-2026-ai)
- [Effective Claude Code Workflows in 2026](https://medium.com/data-science-collective/effective-claude-code-workflows-in-2026-what-changed-and-what-works-now-c93ebc6f8f50)
- [Claude Code Best Practices 2026: What the Official Docs Don't Cover](https://chudi.dev/blog/claude-code-complete-guide)
- [claude-code-game-development (patterns and templates)](https://github.com/HermeticOrmus/claude-code-game-development)
- [ProofShot: give AI coding agents eyes](https://github.com/AmElmo/proofshot)
- [Visual Verification: Making Agents Prove Their Work](https://paddo.dev/blog/multimodal-validation-visual-verification/)
- [Leveraging LLM Agents for Automated Video Game Testing](https://arxiv.org/html/2509.22170v1)

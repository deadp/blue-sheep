# State: Blue Sheep

## Goal
A cozy, turn-based sheep-breeding game built on realistic genetics (TypeScript, Vite, Three.js).
Done: the v3 design is fully built, from pigment colours and breeds to the Golden Fleece ending.

## Now
- Branch complete-game is the default and the only branch. CI (typecheck and unit tests, homelab runner) runs on PRs since 22-10-2026 (#14).
- v3 phases 1 to 6 are done: genetics library, pigment colours, breeds and wool types,
  wool store and demand meters, woolshed crafting queue, fantasy wools (15-10-2026).
- Fleece looks: style e (felted shell with curl shader, fine wavy staple locks) is the default since 15-10-2026;
  steel wool has ringlets. The `?fleece=a|b|c|d` styles remain as experiments.
- Phase 7 is partly built: six chapters, ActNumber 0..5, chapter stats, save key v4 (18-10-2026), and the chapter
  ladder with goal checks, progress lines, rare gate at chapter 3 and remapped unlocks and pacing (19-10-2026).
- Still to do in Phase 7 (docs/BACKLOG.md): item orders, A&P show, Golden Fleece, pōhutukawa summer-red rule,
  and the sim check result that the first rare fleece comes by median season 27. The blind sim now prints a
  chapter/rare-fleece stats block (--seeds n; 21-10-2026), screens a visiting ram before hiring, rare alleles are x2,
  and the sim is run as four chunks of at most 8 seeds, blind8a to blind8d (27-10-2026, #24; replaces the blind30a-d long runs).
  PR 20 (chapter 2 goal: sell 3 item kinds, 27-10-2026) and the sim farmer's woolshed spread (chapter 3 earlier, 28-10-2026, #26)
  are not yet measured: run blind8a to blind8d after them and read the 30-seed numbers (docs/BACKLOG.md).
- Lambing ceremony steps 1 and 2 of 3 are built (forecast marks, first tier, skip; #23, 27-10-2026).
- Preview workflow (#25, 27-10-2026): a push to `queue/q<id>` builds the game and force-pushes it to `preview/q<id>`
  for preview.home; deleting the queue branch removes the preview (the delete half only works from the default branch).
- Phases 8 to 10 are still to do: river valley map, native birds, optional Blender model refresh.
- Known follow-ups, not started: forecast paint triangle and rainbow ring, and flock rendering cost at play zoom.
- Done check is npm test, npm run typecheck and npm run probe (screenshots must be opened and checked).

## Decisions
- 26-09-2026: complete game built: 3D farm, five-act story, orders, fair, vet, visiting rams.
- 27-09-2026: v3 direction written down; no save migration, tutorial spread over three lambings.
- 27-09-2026: look and feel picked: felt and fibre UI, natural friendly sheep, close iso camera.
- 28-09-2026: walk the farmer by default, with pan as an option; UI rebuilt as a felted-wool system.
- 30-09-2026: pigment colours replace the v2 colour model; the game runs on the sheep3 species.
- 04-10-2026: market stock by breed and act; Icelandic only from act 4.
- 05-10-2026: wool sells raw or through a woolshed crafting queue with 12 kiwiana recipes.
- 15-10-2026: Phase 6 built; first-fantasy-fleece sim target and pōhutukawa summer-red rule move to Phase 7.
- 15-10-2026: fleece direction: D (shader curls) best so far, aim for an A+D mix; B staples only if much finer.
- 15-10-2026: style e (A's shell + D's curl shader) made the default fleece look.
- 18-10-2026: Phase 7 step 1 built: six chapters (DESIGN-v3 10.1), save key v4.
- 19-10-2026: chapter ladder steps 2+3 built: goal checks, rare gate at chapter 3, unlocks remapped.
- 22-10-2026: CI added (#14); blind sim stats block and seed split (#8, #16); rare alleles x2 and ram screening (#13); board wool letters say 'fine fleece' until numbers unlock (#15).
- 27-10-2026: lambing ceremony 2/3 (#23); chapter 2 goal is 3 item kinds, constants in config.ts (#20); blind sim in chunks blind8a-d (#24); preview workflow (#25).
- 28-10-2026: sim farmer spreads woolshed jobs over item kinds while chapter 2 needs them (#26).

## Next action
`Finish v3 Phase 7 (item orders, A&P show, Golden Fleece, pōhutukawa rule, rare-fleece sim check (blind8a-d); see docs/BACKLOG.md); finish only when npm test, typecheck and npm run probe pass.`

Last updated: 29-10-2026

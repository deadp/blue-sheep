# State: Blue Sheep

## Goal
A cozy, turn-based sheep-breeding game built on realistic genetics (TypeScript, Vite, Three.js).
Done: the v3 design is fully built, from pigment colours and breeds to the Golden Fleece ending.

## Now
- Branch complete-game is the default and the only branch. No open issues or PRs, no CI workflows.
- v3 phases 1 to 6 are done: genetics library, pigment colours, breeds and wool types,
  wool store and demand meters, woolshed crafting queue, fantasy wools (15-10-2026).
- In progress: fleece looks. Four experimental styles behind `?fleece=a|b|c|d`; the user prefers D
  (shader curls), aiming for an A+D mix, and wants each wool type reworked one by one (steel first).
- Next in docs/BACKLOG.md after the fleece work: Phase 7, chapters, orders, A&P show, Golden Fleece.
- Phases 7 to 10 are still to do: chapters and the Golden Fleece, river valley map, native birds,
  optional Blender model refresh.
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

## Next action
`Rework the wool looks one type at a time (BACKLOG "Fleece look experiment"), then implement v3 Phase 7; finish only when npm test, typecheck and npm run probe pass.`

Last updated: 15-10-2026

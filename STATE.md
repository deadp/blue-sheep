# State: Blue Sheep

## Goal
A cozy, turn-based sheep-breeding game built on realistic genetics (TypeScript, Vite, Three.js).
Done: the v3 design is fully built, from pigment colours and breeds to the Golden Fleece ending.

## Now
- Branch complete-game is the default and the only branch. No open issues or PRs, no CI workflows.
- v3 phases 1 to 5 are done: genetics library, pigment colours, breeds and wool types,
  wool store and demand meters, woolshed crafting queue (last commit 05-10-2026).
- Next in docs/BACKLOG.md is Phase 6, fantasy wools (docs/DESIGN-v3.md section 13).
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

## Next action
`Read docs/DESIGN-v3.md section 13 and docs/BACKLOG.md, then implement v3 Phase 6 (fantasy wools); finish only when npm test, typecheck and npm run probe pass.`

Last updated: 14-10-2026

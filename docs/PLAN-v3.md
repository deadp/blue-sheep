# Plan: v3 Phases 8 to 10

Sources: DESIGN-v3 §8, §9, §10.1, §13 and docs/BACKLOG.md. Plan only, no game code. Q = open question.
Already in the repo: `world3d/valley.ts` (areas as typed data) and `ambient.ts` (cosmetic birds). Phase 8 grows these.

## Order: 8, then 9, then 10

- Phase 8 first: birds need bush-edge perches, and chapter unlocks need zones to exist.
- Phase 9 second: it needs Phase 7 chapters (tūī ch2, kākā and ruru ch3, kiwi ch4, kea ch5) and `benchBonus`.
- Phase 10 last and optional: models swap into a stable map and bird set.
- Gate: the Phase 7 median check (BACKLOG, PR 20 measure) passes first, or the chapter targets move.

## Phase 8: River valley map

- Format: typed TS data in `valley.ts` (`Area` rects, creek spline points, hotspot list). No JSON, no loader, no save change.
- Size: farm floor flat at y = 0, strip about 140 x 60 units (u -30 to 110), plus the village and showground.
- Draw budget: at most 150 draw calls at play zoom with 40 sheep (60 fps laptop, 30 fps swiftshader).
  Terrain, creek, fences and plantings stay instanced and tiled (BACKLOG: tile the locked-land meshes).
- Chapter link: `WorldSnapshot.zones` comes from chapter unlocks: flats and bush edge I ch2, bush edge II and
  showground ch3, terraces ch4, high country ch5.
- Risk: pan camera plus 40 sheep may miss the fps budget; measure with the idle probe before adding dressing.
- Q1: does the pan replace the fixed framing for old saves too, or new saves only?
- Q2: is the high country built empty in Phase 8, or left to ch5 work in Phase 9?

## Phase 9: Native birds

- Flock size: 6 species (pīwakawaka, tūī, kākā, ruru, kiwi, kea), one care record each, 1 on screen per species, plus 4 to 6 ambient extras.
- Behaviours: arrive on chapter plus planting conditions; perch on `FarmBuild.perches`; fly to the visited sheep or the woolshed;
  call (short `audio/` clips); leave after 2 seasons at fondness < 10; return when conditions hold again.
- Genetics link: the kiwi runs a free yearly rare-gene screen on the sheep with the most fantasy-gene uncertainty (posteriors).
- Fleece link: the tūī adds quality through `benchBonus` in `core/craft.ts`; the kea tests steel fleece items for "Kea-proof"; the kākā shows next-season demand.
- Cap: bird power at most 15% of income (DESIGN-v3 §13 sim check).
- Risk: kiwi screens and kākā tips shift the economy and the blind ending rate; rerun the four blind chunks.
- Q3: does the kea ship in Phase 9, or wait for the steel durability star and ch5?
- Q4: is the kiwi berry dye (DESIGN-v3 Q2) in or out?

## Phase 10: Blender model refresh

- Call: DROP for now, stay on procedural meshes.
- Reason: Blender is not on the box and the procedural builders already ship every model without it.
- If reopened: scripts in `art/blender/`, `.glb` under 150 KB each, procedural fallback kept, draw calls within +20% of Phase 8.
- Risk: if kept, committed binaries and a loader add cost and review load for no gameplay gain.
- Q5: should the ponga (tree fern) look fix go into the procedural builder now instead?

## Checks per phase

- npm test, npm run typecheck, npm run probe with every screenshot opened.
- Phase 9 also runs the blind sim (seeds 1-30, four chunks).

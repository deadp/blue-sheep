# Blue Sheep backlog

Ordered queue of work requested by the user and playtesters. Work runs one
subagent at a time. Items move to "Done" with the commit hash.

## In progress / next

Next: v3 Phase 6 (fantasy wools, DESIGN-v3 §13).

Follow-ups from Phase 2, pigment colours (not started):
- The act ladder is still v2 (true blue replaces blue in act 1; the registry wants six full-blue sheep at
  ≤ 28 µm). Once blue is bred, act 4 comes quickly (blind median 4 seasons in act 4); chapters (Phase 7) replace it.
- The fleece and fantasy traits (coat, hair, the six rare wools) are in the phenotype but not yet in knowledge,
  forecasts or the UI (Phases 3 and 6). Mutations (`SPORTS`) are not switched on yet.
- The forecast's paint triangle and the rainbow ring (DESIGN-v3 §12) aren't built; the swatch litter, colour
  words and pigment dots are.
- A white sheep's colour strength is recorded but can't be seen; forecasts use the flock's coloured mean for it.
- Oracle money runs high late (median end 1088, p90 ~7800 when the ending is late); revisit with the wool store
  and two clips a year (Phase 4, §15 item 3).

Follow-ups from the world dressing pass (not started):
- The flock is now the biggest cost at play zoom (wool locks: ~75k triangles and ~40 draws for 13 sheep in
  the home-paddock view, plus their shadow pass). Candidates: a cheaper shadow proxy per sheep,
  distance-based lock detail, merging each sheep's head into its body mesh.
- Runtime auto-lite keeps what was built (terrain resolution, tuft count, wool-lock detail, antialias); only a
  fresh world (the Detail setting, `?lite=1`) gets the full lite build. Rebuilding the flock's wool at lite
  detail on the switch would help slow machines further.
- The locked lands draw as whole-area instanced meshes (their bounding spheres span the land), so rank grass
  and scrub on the flats and far bank are often drawn off screen; tile them like the pasture tufts.
- Ambient life is cosmetic only: birds don't land on the woolshed benches or react to the farmer; the bird
  helpers phase (§8/§15 item 7) can reuse the perches (`FarmBuild.perches`).

Follow-ups from the world pass (not started):
- Performance in software GL: see the dressing follow-ups above (terrain tiles done in the dressing pass).
- Birds at the woolshed stations (the three benches stand empty), the bush-edge perches and the rushy corner /
  terraces as real expansions arrive with their phases (§9, §15 item 7).
- The farmer stays put at night; he could walk home to the homestead for the sleep transition.
- Pet dogs and the cat stay in the home paddock and the barn; they could follow the farmer too.

Follow-ups from the UI foundation (not started):
- The HUD tray and panels are mouse-first; keyboard users can reach everything with Tab, but there is no
  shortcut for Next season or the bag yet.
- Some core strings are still long in panels (fair results, upgrade blurbs, the act-5 goal); trim them in
  core when those systems are reworked in v3.
- Market dogs/cat cards now use embroidered icons; portraits of the real pets would be nicer (see Later).


Nothing in progress. The v3 design pass is written: **`docs/DESIGN-v3.md`** (pigment genetics,
breeds and wool types, fantasy wools, woolshed pipeline, items, demand meters, birds, river
valley, chapters and the Golden Fleece, save migration, ten implementation phases, open
questions). Next: the user answers its §14 open questions, then Phase 1.

Follow-ups noticed during the care pass (not started):
- The blind farmer's blue hunt (act 1) now takes a median of 10 seasons, up from 8.
  Early lamb losses to foxes, mice and the RNG shift play a part. Worth a look in the
  next balance pass.

## After that: v3 direction (user, 2026-09-27)

User's words, lightly edited:

- **Theme:** "fantasy mixed with kiwiana (New Zealand farming)". Unique look and
  tone. Light magic, "think NZ native birds like kākā and kiwi".
- **Colour genetics:** "Colours of sheep should be quantitative and allow all
  sorts of colours to be generated, red, blue etc." Breeding a blue sheep is
  *one* goal, not *the* end goal.
- **Fibre processing:** raw wool is not sold automatically. Stages such as
  carding → spinning → knitting. New patterns unlock with progress (e.g.
  owning a coloured sheep of a given intensity), letting you make socks,
  beanies, red lopapeysa (Icelandic sweaters), etc.
- **Fantasy wool types:** e.g. "steel wool", "cloud wool" for agility pieces;
  to be fleshed out for depth.
- **Economy:** focused on producing specific outputs. Selling a lot of one item
  type lowers its price, encouraging a mix of products.
- **Map:** not a square. Organic island/valley shape.
- **3D models:** refresh later, possibly via Blender (MCP or scripted).

Decisions (user, 2026-09-27, round 1):

- **Colour genetics:** pigment genes. A few loci each add a dose of red,
  yellow or blue pigment; plus a white-masking locus and a dilution locus.
  Colours blend like paint; hidden white still teaches carriers; intensity is
  continuous.
- **Magic:** befriended native bird helpers via the trust system, each with one
  gentle power (e.g. kākā scouts the market, ruru guards at night, tūī makes
  sheep happier, kiwi finds rare plants).
- **Crafting:** seasonal workshop queue in the woolshed (card → spin → knit
  over seasons), each job showing a forecast of quality and price.
- **Tone:** warm kiwiana humour (gumboots, woolsheds, A&P show, pavlova,
  chatty neighbours). Māori words used respectfully for birds and places; no
  retelling of sacred stories.

Decisions (user, 2026-09-27, round 2):

- **Fantasy wools:** rare recessive/mutation genes, detected via the vet or
  surprise lambs, then bred into lines (like blue).
- **Market:** per-item demand meter; selling lowers it, it refills each
  season; villager orders and the fair spike demand.
- **Map:** river valley — rolling hills, a creek, a native-bush edge where the
  birds live, paddocks expanding up the slopes.
- **Long-term goal:** win the Golden Fleece at the A&P show by completing a
  collection (a rainbow of sheep colours, a fantasy wool, a signature knitted
  piece). Blue is one milestone.

Decisions (user, 2026-09-27, round 3):

- **Base wool types / breeds:** breeds are founder lines with different fleece
  genes; wool type is classified from measured fleece traits (fineness,
  staple length, crimp, lustre, double coat for Icelandic). Crossbreds give
  in-between wools. Breeds: Merino, Romney, Corriedale, Perendale, Drysdale,
  Icelandic (plus a plain 'farm' type for the starter flock).
- **Wool suits items:** each wool type suits some items (Merino → socks and
  next-to-skin knits, Icelandic → lopapeysa, Romney → hardy outer knits,
  Drysdale → rugs). Right wool for the pattern gives better quality and price.

Design written: `docs/DESIGN-v3.md` (2026-09-27). v3 includes an early **UI foundation** phase (DESIGN-v3 §15 item 16).

Decisions round 4 and later: see docs/DESIGN-v3.md §15 (binding).

Planned approach: a design pass first (docs/DESIGN-v3.md: genetics model for
continuous colour, fibre pipeline, item/recipe/pattern tree, market saturation,
magic + native birds, act structure without blue as the sole goal, migration of
existing saves), then implementation in phases, each probe-verified.

## Later

- **Ponga (tree ferns)** read palm-like from above: fix in the Blender model pass.
- **Pet model polish** (coordinator, 2026-09-27): collie overlaps sheep and its bubble picks up the nearby sheep's name label; lying Maremma reads as a tan lump; market dog/cat cards use emoji instead of portraits. Fold into the model refresh.
- **Sheep redesign** (user, 2026-09-27): revisit sheep models after v3; the cute pass was "a good improvement".

## Done

- v3 Phase 5 balance pass (separate commit): sim policy crafts (`manageCraft` in `scripts/policy.ts`: circle once money allows, bench upgrades by order, best forecast job per source, items sold while the meter is at least 0.2 or after three seasons, spare fleece raw); item bases roughly x2.3 for early items (socks 38, beanie 32, mittens 32, scarf 42; late items x1.5), `MAX_JOBS` 12 to 16, Old Tom's gift fleece 1 to 3 kg; breed prices Perendale 1.1, Romney 1.2, Merino 1.6, Drysdale 1.4, Icelandic 2.0 (`scripts/breedvalue.ts` table). Blind 30 seeds: ending 100% to 97%, year-3 crafted share 51%, wool+item HHI 0.28, money after season 8 58, year 5 444. Oracle: 100%, share 54%. Open: money after year 5 is about 6x the pre-craft figure.
- v3 Phase 5, woolshed queue, items and patterns (DESIGN-v3 §13; CONTRACTS §13; see git log): `core/craft.ts`, 12 kiwiana recipes, five benches with upgrades, one stage a season, quality with noise band and forecast, item sales through demand meters, patterns gated by made-count, wool press, craft lesson and calendar slot (season 7), report flip of forecast and made. `craft.mjs` probe, `craft.test.ts`. Carry-overs: balance pass (policy crafts, breed prices), Phase 9 birds via `benchBonus`, lots are not blended in a job.
- v3 Phase 4b, blind sim retune and woolshed wording (DESIGN-v3 §15 item 32; see git log): sim policy only (act 4 ignores fineness under 24 um and keeps blue sheep; act 1 weighs red/yellow paint 1.2 and buys a sheep that crosses well with a flock fixed on the wrong alleles); blind ending 70% to 97%, first true blue median 13, oracle 100%. No act 4 goal change was needed. Fleece lot lines drop a fineness word that repeats the wool type ("Strong, a heavy clip"), with a unit test over all types. Full probe re-run green. New sim helpers: `OUT=file.json` shards plus `scripts/merge.ts`, `MAXS=` season cap.

- v3 Phase 4, wool store, raw sales and demand meters (see git log): `core/woolstore.ts` (spring/autumn shearing to fleece lots, washing, store cap, overflow, auto-sell), `core/demand.ts` (meters, refill, seasonal targets, boom as live x2), `woolshed` panel and market wool buyer with an after-you-sell forecast and Reveal, `sellLot`/`sellLots`/`autoSell` actions, `woolstore.mjs` probe. Carry-overs: visiting rams drawn from breed stock, Merino folds at the neck only, long-shot names from one source (`longShotNames`). Open: item meters exist (`item:` keys) but nothing sells items until Phase 5; wool press (store 40) with the woolshed.

- v3 Phase 3 follow-up, breed looks and long shots (DESIGN-v3 §15 item 30; see git log): stronger procedural breed looks (Merino neck folds and dense small locks, Romney hanging long locks, Drysdale spiky hair, mane and bigger horns, Icelandic short under-wool beneath hanging outer locks on shorter legs), crossbred look blended from `breedFractions` via `WorldSheep.breedMix`, forecast outcomes under 8% as one faded sparkle marker swatch plus legend entry, one `LONG_SHOT` threshold for headline, hint and words (unit tests), portrait canvas size bug fixed. New `breedlooks.mjs` probe and before/after sheet, `scripts/sheeptris.ts` cost per breed. Open: visiting rams stay Farm (their genetics are Farm), breed prices (Phase 4).
- v3 Phase 3, breeds and wool types (16c879e): market stock by breed and act (>= 3 breeds at acts 1-3, Icelandic only from act 4), `core/wool.ts` wool-type classification on the measured fleece, breed line from the pedigree, breed + wool-type tag + fleece words on the sheep and market cards (numbers behind the unlock), colour strength word, breed looks in `sheepMesh`, wool-item suitability data; forecast swatch/hint now share one distribution (largest remainder, `NAMED_MIN` 8%). New `breeds.mjs` probe. Open: breed prices untuned, crossbred looks, faded long-shot swatches.
- v3 Phase 2, pigment colours in the game (see git log): the game runs on `sheep3`; fresh v3 save key (old saves
  ignored, "A new season at Kōwhai Creek" once); colour facts in words with confidence dots (hidden colour,
  pigment classes "passes one red dose to every lamb", pale, spots, horns); forecast swatch litter (5 × 2
  lambs tinted with forecast wool, white "?"), goal tabs True blue / Colour (chips: any vivid or a colour) /
  Learn / Fine wool / Heavy fleece, colour hint line; card colour words + pigment dots; vet pigment tests per
  colour; colour-aware orders (names incl. slate/olive, lowest band) and the "Most vivid colour" fair class;
  tutorial lamb 3 is a clear red from the two white carriers; world wool hex + family (mesh, portraits,
  minimap); auto-lite remembers (10 boots / 7 days). Balance (blind, 30 seeds): first true blue median season
  14, ending 97 %, median end money 535; oracle: true blue 11, ending 100 %, money 1088. New `probe/colour.mjs`.

- v3 world dressing pass (d6f249d, DESIGN-v3 §15 item 27): the valley reads as a lived-in Kiwi farm at play zoom
  without mist — a gently rolling farm floor that everything stands on, worn tracks with wheel ruts, gateway
  mud and a puddle, clover and sunny/lush mottling, flower drifts, a kōwhai shade tree, cabbage trees, rocks,
  thistles and long grass along the fences in the home paddock (the flock walks round them); toetoe, ponga,
  harakeke and river stones along the creek; dry-stone walls and clipped hedgerows by the road; a rotary
  clothesline, woodpile and tyre swing at the homestead, a grey tractor by the barn, a quad bike and woolpacks
  at the woolshed, the letterbox flag, a tidier vet's ute; soft contact shadows under everything; warmer spring
  light. Ambient life: birds between the trees, butterflies, creek sparkle, chickens, softer smoke. Detail:
  Auto / Full / Lite in Settings (auto measures the first 5 s and after a resize, goes lite over a 40 ms median
  and says so once); `?detail=` pins it and every probe pins `detail=full`. Perf at 1280×800 is at or below the
  world pass (terrain tiles, tiled seasonal layers, fewer shadow casters). New `probe/dressing.mjs`,
  `probe/dressing-sheet.mjs`; fixed bush kōwhai blossom being built at the world origin and paddock daisies
  showing in winter.

- v3 world pass (f0f1f73): the square diorama is replaced by the close-iso Kōwhai Creek valley at play scale
  (`world3d/valley.ts`, `farm.ts`): homestead, barn, home paddock, trader's stall and pen, mailbox, woolshed with
  its verandah stations (empty benches) and yards, vet's hut and ute, showground, creek and bridge, native bush
  edge; the creek flats, far bank, rushy corner and terraces as locked land (scrub, rank grass, broken fences, a
  sign, felt price tags). "Open the far paddock" opens the creek flats and "Rent the long meadow" builds the
  bridge to the far bank, each with the reveal; the rest is "Coming later". Walking farmer by default
  (click-to-walk with A* pathing, WASD, walk-up prompts E/F, far sheep walked to before their card opens), pan
  mode with drag, signposts and a felt minimap (Tab or the felt switch, kept in Settings); fond sheep follow in
  their own paddock, shy ones step away. The natural sheep with the friendlier face; soft round-3 light, no
  mist, seasonal tints, kōwhai/pōhutukawa bloom, snow shader; `?lite=1`. Sheep card shows a one-line "what you
  know"; the forecast litter is 5 × 2 with bigger lambs. New `probe/world.mjs`.

- v3 UI foundation, felted wool (78ca7af): `ui/felt/` design system (tokens, procedural felt and blanket
  stitch, embroidered SVG icon set replacing every emoji, pom-pom badges, felt buttons with a springy press,
  tags, tabs, one meter style for odds/learning/hearts/dots, "more" folds, fact tiles, toast, mentor card;
  Patrick Hand for headings and names, Nunito for the rest). Minimal HUD (season/coins/flock poms, goal tag,
  a bag with a tray of places, Next season); every panel restyled with about 55% fewer visible words and
  details behind "more"; the sheep card docked as in the style lab; the forecast with parents on the left.
  New `probe/ui.mjs` (both sizes, hit targets ≥ 36 px, no HUD overlap). The 1024×768 HUD overlap is fixed.

- v3 Phase 1, genetics v3 library (7f2ee12): `sheep3` species (W mask, 2 pigment loci per colour, dilution, spotting, horns, double coat, hairy fibre, six fantasy loci with sports at μ 0.001, fleece QTLs incl. staple, lustre, colour strength); `woolColour` paint-mix model with families, intensity, true blue; seven breeds with calibrated founder frequencies and `woolType`; inference honours masking, has breed priors and a locus-swap move, and runs ~3× faster (15 traits × 200 sheep ≈ 0.2–0.3 s). Palette sheet: `packages/genetics/scripts/palette.ts`. The game is unchanged; next is Phase 2.

- Pacing calendar + mini-lessons + three-lamb tutorial + hold-to-brush (6ecfcf6): vet Y2 Spring, improvements Y2 Autumn, dogs/foxes Y3 Spring, cat/mice Y3 Autumn, letters as the tutorial ends; data-driven Old Tom lessons (core/lessons.ts) for every concept; tutorial spread over three lambings (white, horned + Punnet, black); press-and-hold brushing and pats; forecast litter one row, long names ellipsised. Blind 30 seeds: 90% ending, median 26, money 475 (seeds 31–60: 97%, 28, 426).

- Tutorial + pacing + brushing (0af0576): Punnet square with horns in the tutorial (2×2, pictures and
  words, 3 polled : 1 horned, hover/click interactive, letters only with numbers) and again for the surprise
  colour; codex "Punnet square" card; reusable `ui/punnet.ts`. No handover: every farm (tutorial, skip,
  `?seed`) starts with the same two sheep; concepts open one a season via `core/pacing.ts` (cards → orders →
  vet → farm → dogs → cat, then numbers/fair, tree/visitor with their acts); quieter first-year market and a
  one-letter order board to start. Brushing on the live portrait (+6 once a season; a pat for dogs and the
  cat). Balance rerun for the small start (blind 97 % ending, median season 29, median end money 582).

- Care mechanics (abffc28): fondness hearts per sheep, dog and cat (greet once a
  season, 1-coin treats, slow fade; up to +15% wool); three dogs (terrier,
  collie, Maremma) against foxes and the new wolf; Mog the cat against mice;
  animal card; predator and mice forecasts; save migration (dog becomes collie).

- Cute sheep + unique procedural voices (dce5d99).
- Tutorial with two sheep and Old Tom (ad84ef4).
- Presentation pass: personalities, live portraits, infographics (f2942ca).
- Balance pass: farm improvements, economy sinks (dc0d9c2).
- Complete game v1 (45dab0f).

- v3 Phase 4 balance pass (separate commit): `RAW_STEP` 0.005 to 0.002; sim policy keeps a feed reserve in non-shearing seasons (wool now pays only in spring and autumn). Oracle 30 seeds: ending 97% (before Phase 4: 93%), median end money 1399 (462). Blind 30 seeds: ending 70% (90%), first true blue 26/30 median season 14 (27/30, 13), median end money 1130 (413), money after season 8 / year 5 78 / 85 (90 / 143). Blind ending dips are act-4 fineness and inbreeding stalls, not money; breed prices untouched. Open: tune blind-brain keep rules for the new market.

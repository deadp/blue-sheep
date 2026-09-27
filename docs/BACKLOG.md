# Blue Sheep backlog

Ordered queue of work requested by the user and playtesters. Work runs one
subagent at a time. Items move to "Done" with the commit hash.

## In progress / next

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

Design written: `docs/DESIGN-v3.md` (2026-09-27). Decisions round 4 and later: see docs/DESIGN-v3.md §15 (binding).

Planned approach: a design pass first (docs/DESIGN-v3.md: genetics model for
continuous colour, fibre pipeline, item/recipe/pattern tree, market saturation,
magic + native birds, act structure without blue as the sole goal, migration of
existing saves), then implementation in phases, each probe-verified.

## Later

- **Pet model polish** (coordinator, 2026-09-27): collie overlaps sheep and its bubble picks up the nearby sheep's name label; lying Maremma reads as a tan lump; market dog/cat cards use emoji instead of portraits. Fold into the model refresh.
- **Sheep redesign** (user, 2026-09-27): revisit sheep models after v3; the cute pass was "a good improvement".

## Done

- Tutorial + pacing + brushing (COMMIT_HASH): Punnet square with horns in the tutorial (2×2, pictures and
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

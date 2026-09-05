# Blue Sheep — design direction (v2)

Status: draft after two prototypes (DOM cards, then Phaser top-down). This doc is
the plan; the code follows it.

## 1. What we are testing

Can realistic quantitative genetics drive a cozy game where the fun is
**predicting and discovering** what sheep will pass on? Not data entry, not
spreadsheets. The player should feel like a detective and a gardener.

Two prototypes taught us:

- Genotype dropdowns (`B/b`) are homework. Nobody wants to type genotypes.
- Physical-only breeding (lead sheep into pens) is charming but slow and opaque.
  Players need to choose a mating directly and see what it might produce.

## 2. Core idea: predictions, not genotypes

The player never writes a genotype. Instead:

1. They pick a **mating** (ewe × ram) and the game shows a **forecast** of lambs,
   computed from the player's *current knowledge* — not the true genome.
2. Every lambing is a **reveal**. Unexpected lambs update the model and produce
   **discoveries** ("Clover carries a hidden dilute") shown as collectible
   notebook cards, deduced automatically.
3. Some matings are chosen to **learn** (test crosses), some to **progress**
   (toward a goal). The forecast panel shows both: outcome odds and a
   "what you'd learn" meter. That tension is the game.

The forecast sharpens as knowledge grows (pedigree depth, vet tests, unlocked
notebook tiers). Same cross, better forecast later — visible mastery.

## 3. Forecast panel (the central UI)

Opens from any sheep ("Find a mate") or from the breeding board.

Left: chosen ewe. Right: candidate rams, sorted by a chosen goal (e.g. "blue",
"finer wool", "learn the most"). Middle, for the selected pair:

- **Litter preview** — a row of 10 lamb icons coloured by probability
  ("if you had ten lambs, about 3 would be black, 1 might be blue"). Early tiers
  show icons only; later tiers add percentages.
- **Fleece forecast** — a range bar per quantitative trait: expected lamb value
  with an uncertainty band, parents' values and flock average as ticks. Band
  narrows as heritability knowledge and pedigree depth grow. Later tier: a
  proper distribution curve.
- **Relationship** — "half-siblings" / "unrelated", inbreeding of the lamb, a
  gentle health-risk pictogram when F is high.
- **Learn meter** — expected information gain about hidden loci from this cross.
- **Notes** — plain-language hints unlocked by tier: "White hides other colours."

Under the hood: probabilistic inference over the pedigree (Gibbs sampling over
genotypes consistent with all observed phenotypes and tests, priors from founder
allele frequencies). Replaces the current possible/impossible sets with
posteriors. Quantitative forecasts: midparent breeding-value estimate with a
variance that depends on how many phenotyped relatives exist (knowledge score),
plus environmental noise.

## 4. Notebook v2: discoveries, not dropdowns

- **Sheep page**: portrait, traits, pedigree snippet, and a list of *known facts*
  in words ("carries dilute", "definitely not a carrier", "unknown"), with a
  confidence dot. Facts come from the inference engine.
- **Discovery cards**: earned when a lambing pins something down. Small
  celebration. Cards fill a collection page — the genetics "codex" grows as
  the player plays (this is the tutorial, disguised).
- **Hunches** (later tier): the player may record a hunch ("Clover is a carrier")
  and gets a bonus when it is proven. Optional; never required.

## 5. Loops

**Moment (30 s):** look at a sheep → open forecast → compare two rams → pick.

**Season (5 min):** choose matings (each ram serves at most N ewes) → sleep →
lambing reveal with discoveries → shear/milk → fulfil orders → spend → new
market stock.

**Year (4 seasons):** village **fair** (judged on a target trait), a **visiting
ram** for hire (fresh genes, no pedigree, no knowledge), one **event** (hard
winter, fox, wool-price spike), and **orders** from villagers ("a black ewe by
autumn") which reward good forecasting.

**Arc:** acts unlock concepts, tools and space (see §6).

Fun drivers: surprise (reveals), mastery (sharper forecasts), collection
(colours, patterns, discovery cards, named lines), expression (naming sheep,
decorating the farm), gentle economy.

## 6. Concept ladder (one new idea per act)

| Act | Hook | Concept | Unlock |
|-----|------|---------|--------|
| 0 | Two white sheep have a black lamb | Hidden traits exist | Forecast panel (icons only) |
| 1 | "Breed me a blue sheep" | Dominant/recessive, carriers | Discovery cards, vet carrier test |
| 2 | Wool buyer pays for fineness | Continuous traits, selection, heritability | Fleece forecast bars, measurements after shearing |
| 3 | Lambs from close relatives are small | Relatedness, inbreeding depression | Family tree, visiting rams |
| 4 | Blue lambs keep having coarse wool | Linkage and recombination | Marker test, chromosome view |
| 5 | Big sheep have coarser wool | Pleiotropy, trade-offs, roles | Show / dairy / guardian roles, more paddocks |
| 6 | A lamb is a colour nobody has seen | Mutation, diversity, founder effects | Breed registry, multiple lines |

Concepts are never explained up front; the hook happens, then the notebook
card names it.

## 7. Roles and trade-offs (act 5+)

Show (colour rarity, crimp, calm), dairy (milk), guardian (size, boldness),
fleece (weight, fineness). Pleiotropy in the species definition makes them
conflict (growth locus raises size and microns). Player specialises lines and
must manage relatedness across them. Flock cap grows 6 → 20 → 40 → 80.

## 8. Presentation

Move to **Three.js with an orthographic isometric camera** and **flat-shaded
low-poly procedural sheep**. Reasons:

- Sheep as a mesh is a few blobs; phenotype maps directly to geometry and
  material (colour, spot noise, horn curves, body scale, wool puffiness from
  crimp, sheen from fineness). Distinct look, no art pipeline, no 4-facing
  sprites.
- Orthographic camera gives the isometric feel with free rotation later.
- Pastel palette, soft shadows, gentle idle animations (breathing, head bob,
  grazing). Cozy comes from motion and colour, not detail.

World: small farm diorama (house, paddocks, shed, market stall). Click a sheep
to select; the world is a stage for the UI, not a maze. Optional walking farmer
later. Panels (forecast, notebook, board) are HTML over the canvas.

## 9. Architecture

```
packages/genetics/   pure TS: genome, meiosis, traits, pedigree   (done)
packages/inference/  posterior genotype probabilities, forecasts, info gain
packages/game/       state + season sim (done), goals/orders/events
packages/world/      Three.js diorama, procedural sheep meshes, camera, picking
packages/ui/         HTML panels: forecast, notebook, board, HUD
```

## 10. Build order

1. Inference v2: Gibbs posteriors, lamb outcome distribution, quantitative
   forecast with knowledge-scaled variance, information gain. Tests against
   exact enumeration on tiny pedigrees. (~2 days)
2. Forecast panel + notebook v2 as HTML, driven by current sim, with the
   existing Phaser world as a placeholder stage. Mate selection from any sheep.
   Fix: lambs must always appear when a valid mating is chosen. (~1–2 days)
3. Playtest the forecast loop for 15 minutes. Is choosing between "learn" and
   "progress" fun? Adjust before touching graphics.
4. Three.js diorama with procedural sheep; swap the stage. (~3–4 days)
5. Orders, fair, visiting ram, events (Act 2–3 content). (~2 days)
6. Roles, linkage/marker test, registry (Acts 4–6) as later milestones.

## 11. Decisions (2026-09-05)

- Engine: Three.js, orthographic isometric camera, procedural low-poly sheep.
- Order: forecast loop first on the current stage; graphics after a playtest.
- Control: walking farmer plus HTML panels; seasons are turn-based (sleep).
- Numbers: lamb icons first; percentages, h² and distributions are an
  unlockable expert view.

## 12. Validated pattern (2026-09-06)

The forecast panel was confirmed as the right direction. Everything else in the
game should be built to the same pattern, which generalises beyond breeding:

**Decide → forecast → commit → reveal → learn.**

1. **Decide** — the player faces a choice between named options (candidate mates,
   later: which lamb to keep, which order to accept, which ram to hire).
2. **Forecast** — before committing, show the *distribution of outcomes* under
   the player's current knowledge. Never a single number, never the truth.
3. **Commit** — one clear button; the plan is visible on the shed board until it
   resolves.
4. **Reveal** — the season report is the payoff moment. Outcomes land against
   the forecast the player saw.
5. **Learn** — the inference engine updates; anything newly pinned becomes a
   discovery card. The forecast for the same cross is sharper next time.

Design rules extracted from the panel:

- **Ranked candidates, not a list.** Goal tabs (Blue lamb / Learn the most /
  Finer wool / Heavier fleece) re-sort the options and re-label the hint column.
  Every future choice screen gets goal tabs.
- **Uncertainty is drawn, not written.** Ten lamb icons; a band, not a point, on
  range bars. Width of the band *is* the knowledge meter.
- **Two competing currencies.** Progress toward the goal vs. information gained.
  The learn meter makes test crosses a real alternative to the greedy choice.
  Future systems (orders, fairs, roles) should each add a currency that
  sometimes conflicts with the others.
- **Plain sentences with confidence dots** for everything the player knows.
  No genotype strings in the UI, ever.
- **Numbers are a reward.** Percentages, h² values and distribution curves are
  the `numbers` unlock, earned by playing.

### Where the pattern applies next

| System | Decide | Forecast shown |
|--------|--------|----------------|
| Orders | Accept a villager's order? | Odds you can fill it in time from your current flock |
| Fair | Which sheep to enter? | Your entry against the field's expected quality |
| Visiting ram | Hire this outsider? | Outcome spread widened by unknown pedigree |
| Culling | Sell which lamb? | What each one would contribute to the goal |
| Vet test | Test which locus? | How much the test would narrow the forecast |

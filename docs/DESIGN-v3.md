# Blue Sheep v3: design

Status: design pass, 2026-09-27. It builds on the user's decisions in `docs/BACKLOG.md`
("v3 direction", rounds 1–3), which are binding. v2 intent and the validated
**Decide → Forecast → Commit → Reveal → Learn** pattern (`docs/DESIGN.md` §12) still apply to
every new system. Where this doc and the v2 contracts disagree, this doc is the target. Each phase
(§13) updates `docs/CONTRACTS.md` as it lands.

Numbers are starting values for the balance passes, not final tuning.

---

## 1. Vision and tone

**One line:** a cosy breeding-and-craft game in a magical New Zealand river valley. You breed
sheep in every colour of the rainbow, turn their wool into knits at your woolshed, make friends
with the native birds, and bring home the Golden Fleece from the A&P show.

- **Fantasy, lightly done.** Magic is small and gentle: birds with one kind power each, a few rare
  fleeces that behave oddly (steel, cloud, glow-worm), glow-worm sparkles at dusk. No wizards, no
  combat, and no spiritual lore.
- **Kiwiana humour.** Gumboots by the back door, the woolshed radio, a smoko tin of pikelets, the
  ute, No. 8 wire fixes, jandals in summer, pavlova at the show, a chatty neighbour who leans on
  the gate. Short, dry, warm lines, e.g. *"She'll be right. Probably."*
- **Cast (villagers).** Old Tom (mentor, stays), Granny Moss (stays), **Aunty Mere** (runs the
  knitting circle), **Hemi** (shearing-gang boss), **Sheryl** (village store and wool buyer),
  **Dr Anand** (the vet, arrives in her ute), **Barry from over the hill** (friendly rival at the
  show), **Young Ada** (stays; orders). The English-village names (the Vicar, the Miller, Mr
  Hollis) retire.
- **Te reo Māori, used respectfully.** Use te reo names for native birds, plants and a few
  everyday words, always with macrons. Invented place names stay English or use plain
  descriptive te reo already common in NZ English (see the glossary). No retelling of pūrākau
  (traditional stories), no sacred concepts (e.g. mauri, tapu, whakapapa as mechanics), no
  mythological framing of birds. Birds are wildlife and friends, not spirits.
- **Genetics stays honest.** The magic sits *on top of* real rules: pigment doses add up, white
  masks colour, recessives hide, crossbreds land in between.

### Glossary (planned te reo)

| Word | Meaning | Where it's used |
|------|---------|-----------------|
| kākā | forest parrot (brown, red underwings) | bird helper |
| kiwi | flightless nocturnal bird | bird helper |
| tūī | songbird with white throat tufts | bird helper |
| ruru | morepork, small native owl | bird helper |
| pīwakawaka | fantail | bird helper |
| kea | alpine parrot, famously cheeky | optional late bird |
| harakeke | NZ flax | bush planting |
| kōwhai | tree with yellow flowers | bush planting, "Kōwhai Creek" |
| mānuka | tea-tree shrub | "Mānuka Flat" village |
| pōhutukawa | red-flowering "NZ Christmas tree" | a fantasy wool |
| pāua | abalone with iridescent shell | a fantasy wool |
| ngahere | forest, bush | the bush-edge zone label |
| awa | river | the creek label, "the awa" |
| kai | food | treats/offerings ("bird kai") |
| kia ora | hello, thanks | greetings |
| ka pai | good, well done | reveal lines |
| mahi | work | woolshed ("today's mahi") |

**A native speaker must review** every te reo string (spelling, macrons, whether it fits the
context) before release. Keep all of them in one file (`core/words.ts` `TE_REO`) so the review is
a single pass.

---

## 2. Colour genetics: pigment genes

### 2.1 Loci

Colour moves to a new chromosome 4, and the v2 A/B/D loci retire (migration in §11). Every
colour locus is biallelic, so it fits the existing inference engine.

| Locus | Alleles (index 0, 1) | Founder freq of index 0 (farm type) | Effect |
|-------|----------------------|-------------------------------|--------|
| `W` white mask | `w`, `W` | 0.45 (so 20 % of founders show colour) | `W` dominant: wool is white and hides every pigment. It's the v2 "hidden colour" lesson with a new name. |
| `R1`, `R2` red | `-`, `+` | `+` freq 0.20 | each `+` adds one red dose (0–4 total) |
| `Y1`, `Y2` yellow | `-`, `+` | `+` freq 0.25 | each `+` adds one yellow dose (0–4) |
| `U1`, `U2` blue | `-`, `+` | `+` freq 0.10 (rarest) | each `+` adds one blue dose (0–4) |
| `Dl` dilution | `d`, `D` | `d` freq 0.25 | `d/d` makes pastels (pink, sky, lemon…) |
| `S` spotting | `s`, `S` | `s` 0.35 (kept) | `s/s`: white patches on coloured wool |
| `P` polled | `p`, `P` | 0.5 (kept) | horns |

Also new, on chromosome 5 (fleece, §3):

| Locus | Alleles | Effect |
|-------|---------|--------|
| `DC` double coat | `dc`, `DC` | dominant; long outer coat plus a fine inner coat (Icelandic) |
| `N` hairy fibre | `n`, `N` | dominant (the real Drysdale "Nd" gene): +8 µm, +40 mm staple, medullated carpet wool |

**Colour strength** is continuous, as the user asked. It's a quantitative trait `depth` (label
"Colour strength"): mean 1.00, four QTLs `CD1–CD4` with a = 0.08, envSd 0.08, clamped to
0.60–1.40, expected h² ≈ 0.65. Selection on it is the "quantitative" route to vivid colour.

Place the pigment channels on different chromosomes or ≥ 40 cM apart. Inference ignores linkage,
so this keeps the forecasts honest.

### 2.2 Colour model

Pure function in genetics, `woolColour(ph) → { hex, family, intensity, dilute, spotted }`:

1. `W` present → **white** (`#FAFAF7`), family `white`, intensity 0.
2. Pigment amounts: `ρ = min(1, r/4 × depth)`, and the same for `γ` (yellow) and `β` (blue).
3. **Paint mixing.** Trilinear interpolation in an RYB cube (Gossett–Chen). Corner colours:
   000 oatmeal `#EDE3CF`, 100 red `#C8322F`, 010 yellow `#F2C230`, 001 blue `#2F5DA8`, 110 orange
   `#E07A2A`, 011 green `#3E8E4A`, 101 purple `#6E3A8E`, 111 charcoal `#2B2724`. So red + yellow
   = orange, yellow + blue = green, red + blue = purple, and all three = brown or charcoal, like
   paint.
4. **Dilution** `d/d`: mix 45 % toward white.
5. **Intensity** `I = (max(ρ,γ,β) − min(ρ,γ,β)) × (dilute ? 0.5 : 1)`, from 0 to 1. Charcoal and
   brown are rich, natural colours but have low intensity.
6. **Family** (for words, orders, the rainbow): take `m = min` and `C = max − min`.
   - `C < 0.2`: neutral. `m < 0.25` oatmeal, `m < 0.6` taupe, otherwise charcoal.
   - `C ≤ 0.5` and `m ≥ 0.35`: **brown** (russet).
   - Otherwise, subtract `m` and look at the two largest components. If the second is < 0.5× the
     first, the family is the single hue (red, yellow, blue). If it is ≥ 0.5×, it's the pair
     (orange, green, purple).
   - Dilute names: pink, peach, lemon, mint, sky, lilac.
   - **Gold** is a named special: yellow or orange, `I ≥ 0.6`, lustre ≥ 6 (§3).

| Example (r, y, b, depth) | Result |
|---------------------|--------|
| 0,0,4, 1.0 | blue, I 1.00 ("true blue") |
| 0,0,2, 1.3 | blue, I 0.65 (strength carries a low dose) |
| 1,0,3, 1.0 | blue, I 0.75 (a touch of purple, still true blue) |
| 4,0,4, 1.0 | purple, I 1.00 |
| 2,2,0, 1.0 | orange, I 0.50 |
| 3,3,3, 1.0 | charcoal |
| 3,3,2, 1.0 | brown |
| 0,0,0, any | oatmeal (natural, unmasked, no pigment) |
| 4,0,0 + `d/d` | pink, I 0.50 |

Oatmeal is visibly warmer than mask-white. Mask-white also gets a faint sparkle in the world and
a "snow-white" word, so the two never read the same.

**Blue milestone ("true blue"):** family blue, `I ≥ 0.6`, not dilute. Well under 1 % of founders reach
it, so blue has to be bred. The starter flock is resampled until it holds
**≥ 3 blue `+` alleles** and ≥ 1 visibly coloured sheep (like v2's `dCount ≥ 2` rule), and no
founder is already true blue.

### 2.3 Inference: one small trait per channel

The engine's cost is set by joint genotypes per trait. I measured it on a 150-sheep inbred
pedigree with 40 % of phenotypes unobserved (300 samples):

| Loci in one trait | Joint genotypes | Posterior | 20 lamb forecasts |
|---|---|---|---|
| 2 | 9 | 62 ms | 3 ms |
| 3 | 27 | 115 ms | 10 ms |
| 4 | 81 | 729 ms | 50 ms |
| 5 | 243 | 6.4 s | 174 ms |

So colour is **not** one 9-locus trait (3⁹ joint genotypes). It's split into small traits that
are independent given the evidence:

| Discrete trait | Loci | Joints | Phenotype string (for inference) |
|---|---|---|---|
| `white` | W | 3 | `"white"` / `"coloured"` |
| `red` | R1 R2 | 9 | dose `"0"…"4"`; **missing when white** |
| `yellow` | Y1 Y2 | 9 | same |
| `blue` | U1 U2 | 9 | same |
| `dilute` | Dl | 3 | `"pale"` / `"full"`; missing when white |
| `pattern` | S | 3 | `"spotted"` / `"solid"`; missing when white |
| `horns` | P | 3 | kept |
| `coat` | DC | 3 | `"double"` / `"single"` |
| `hair` | N | 3 | `"hairy"` / `"plain"` |
| 6 × fantasy | one each | 3 | e.g. `"steel"` / `"plain"`, §4 |

**Masking is exact.** `W` is independent of the pigment loci, so a white phenotype carries no
information about doses. Leaving the channel phenotype undefined is the correct posterior, not an
approximation. The constraint code already skips the filter when the observed value is
`undefined`. Add an optional `maskedBy?: { trait: string; value: string }` to `DiscreteTrait`
(genetics stays pure), and have `knowledge.individuals()` drop masked phenotypes.

**The hidden structure still teaches carriers:**

- A white sheep's pigment is unknown until its lambs show it: "hidden colour under the white".
- A dose of 2 can be 1 + 1 (both loci heterozygous: lambs get 0–2 from this parent) or 2 + 0 (one
  locus homozygous: exactly 1 to every lamb, "breeds true"). The notebook spells it out: *"Rosie
  passes one red dose to every lamb."*
- Dilution, spotting and the fantasy genes are classic recessives.

**Lamb colour forecast.** `P(white)` comes from the `white` posterior. Given a coloured lamb, the
three channel dose distributions (`lambOutcomes` per channel), `dilute` and the depth forecast
(`forecastQuantitative`) combine as a product. That's valid because the loci are unlinked in the
model. 5 × 5 × 5 × 2 + 1 = 251 classes, collapsed for display:

- **Swatch litter** (replaces the ten lamb icons): ten lamb swatches allocated by largest
  remainder over classes. Each is tinted with the class hex at the pair's forecast mean depth,
  and a white share is shown as white lambs with a "?" tag ("white on top; colour underneath
  unknown").
- **Words:** the top three families with intensity bands (soft < 0.3 ≤ bright < 0.6 ≤ vivid),
  e.g. *"Most lambs orange, about one in five green, a long shot at vivid blue."*
- **Strength bar:** the range bar for `depth`, drawn as a gradient from dull to vivid of the
  target hue.
- **Goal tabs:** *Colour ▸ (pick a swatch from the families you have seen)*, *Learn the most*,
  *Finer wool*, *Longer staple*, *Rare wool*. The colour tab ranks by P(target family with
  I ≥ target).

**Limits for future loci:** ≤ 27 joint genotypes per trait (≤ 3 biallelic loci), and ≤ 18
discrete traits. The table above has 15 traits and costs about 60 ms for each 9-joint trait and
about 10–15 ms for each 3-joint trait. That is ≈ 350 ms per full recompute at 150 sheep, which
already happens only when the pedigree or tests change (`knowledgeKey`). Phase 1 adds a
benchmark test: all traits on a 200-sheep fixture in < 600 ms on the dev box. If that fails,
compute single-locus traits by exact peeling or run posteriors in a Web Worker. Don't cut
samples below 300.

**Vet tests (v3):** `W`, `Dl`, `S`, `P` (12 coins each, as now), a **pigment test** for one
channel (12 coins; pins both loci), and a **rare-gene screen** (20 coins; all six fantasy loci at
once, §4). `DC` and `N` are visible, so there's no test.

---

## 3. Breeds and base wool types

### 3.1 Fleece traits

| Trait | Unit | Change from v2 |
|---|---|---|
| Fineness (fibre diameter) | µm | mean 28, six QTLs `FN1–6` a = 1.5 (Σ 9), `GR1/GR3` pleiotropy kept, envSd 1.5, `N` +8 |
| Staple length (new) | mm | mean 110, four QTLs `SL1–4` a = 12, envSd 10, `N` +40, `DC` +20, min 40 |
| Crimp | /cm | mean 4.5, `CR1–4` kept, plus each fine `FN` allele +0.3 (finer wool crimps more, as in real sheep) |
| Lustre (new) | 0–10 | mean 4, `LU1–3` a = 1.2, envSd 0.6 |
| Double coat | yes/no | `DC` locus. Measured µm = 0.6 × outer + 0.4 × inner; the card shows both ("outer 30 µm, inner 20 µm") |
| Fleece weight | kg | kept |
| Colour strength (new) | ×0.6–1.4 | §2 |

`milk` (`MK1–4`) is unused in play. It retires, and its loci seed migrated sheep's new QTLs (§11).

### 3.2 Founder breeds

A breed is a set of **founder allele frequencies** (`BreedSpec` in `genetics/src/breeds.ts`;
`sampleFounder(map, rng, freqOverride)`). It is not a fixed offset. That makes crossbreds land in
between naturally and lets selection move a line. The targets are breed means of sampled
founders, and the Phase 1 test asserts each within ±1 unit (±5 mm for staple) over 2000 samples.

| Breed | µm | Staple mm | Crimp | Lustre | Fleece kg | Body kg | Special | `w` freq (coloured) | pigment `+` freq |
|---|---|---|---|---|---|---|---|---|---|
| Merino | 19 | 75 | 7 | 2 | 5.0 | 50 | fine, dense | 0.10 | ×0.5 |
| Corriedale | 26 | 100 | 4.5 | 4 | 5.0 | 60 | dual-purpose | 0.20 | ×1 |
| Perendale | 30 | 120 | 3.5 | 4 | 4.0 | 55 | hardy hill sheep | 0.20 | ×1 |
| Romney | 34 | 150 | 2.5 | 7 | 5.5 | 65 | lustrous longwool | 0.25 | ×1 |
| Drysdale | 40 | 190 | 1 | 3 | 6.0 | 60 | `N` fixed, horned both sexes | 0.10 | ×0.5 |
| Icelandic | 27 (30/20) | 140 | 2.5 | 6 | 2.5 | 50 | `DC` fixed, horned, many colours | 0.60 | ×1.6 |
| Farm (starter) | 30 | 100 | 4 | 4 | 4.0 | 60 | v2 founder frequencies | 0.45 | ×1 |

The frequency of fine alleles `p(FN+)` is set to hit the µm target: Merino 0.95, Corriedale 0.62,
Farm/Perendale 0.39, Romney 0.2, Drysdale 0.3 (plus `N`), Icelandic 0.55. The same approach sets
staple, crimp, lustre and weight; the Phase 1 calibration script solves them.

**Availability at the market** (Sheryl's store and the stock agent): Farm and Corriedale from the
start; Romney and Perendale from ch1; Merino from ch2; Icelandic and Drysdale from ch3 (one of
them offered each spring). Price: Farm 1.0×, Corriedale and Perendale 1.2×, Romney 1.3×, Merino
1.5×, Drysdale 1.6×, Icelandic 1.8× of the v2 `marketWorth`.

The sheep card shows a **breed line**: "Romney", "Merino × Romney" (50/50), or "¾ Corriedale".
It's computed from founder-breed fractions through the pedigree (a new
`breedFractions(state, id)`, the same recursion as relatedness). Purely descriptive, and always
knowable.

### 3.3 Wool type classification

A pure function `woolType(ph)` in core, checked in this order:

| # | Wool type | Rule | Typical source |
|---|---|---|---|
| 1 | **Lopi** | double coat and staple ≥ 110 | Icelandic |
| 2 | **Carpet** | hairy (`N`) or µm ≥ 37 | Drysdale |
| 3 | **Fine** | µm ≤ 21.5 | Merino |
| 4 | **Medium** | µm ≤ 27 | Corriedale, Merino × longwool |
| 5 | **Lustre longwool** | µm > 31, lustre ≥ 6, staple ≥ 130 | Romney |
| 6 | **Strong** | µm 27–33 and staple ≥ 100 | Perendale |
| 7 | **Crossbred** | anything else | Farm |

Crossbreds fall in between: Merino × Romney ≈ 26.5 µm, 112 mm is Medium, which matches the
Corriedale's real origin as a fine × longwool cross. The card shows the type as a coloured tag and
a one-line reason: *"Medium wool: 25 µm, good crimp."*

---

## 4. Fantasy wools (rare genes)

Each fantasy wool is **one biallelic locus**, so it's cheap in inference and has classic carrier
logic. Rare alleles appear only in some sources, plus *sports* (new mutations). Once found,
they're bred into lines, like blue.

| Wool | Locus | Inheritance | Where the allele comes from | Look (world3d) | Fibre property | Uses |
|---|---|---|---|---|---|---|
| **Steel wool** | `ST` | recessive | Romney, Perendale, Drysdale at 3 %; sports | gunmetal sheen, springy tight curls, faint *ting* in its bleat | tough: items get "Kea-proof" eligibility and +1 durability star | fencing gloves (for the No. 8 wire), tramping gaiters, steel-wool pot scrubber (a joke item: it sells to Sheryl for 1 coin) |
| **Cloud wool** | `CL` | recessive | Merino, Corriedale at 2 % | fleece so light the sheep bobs a finger's width off the grass | weightless: 0.3× fibre per item, needs the drum carder | cloud socks ("tramp all day"), cloud beanie; agility pieces |
| **Glow-worm wool** | `GW` | recessive | Icelandic, Farm at 2 % | soft blue-green glow at dusk and night | glows: night items | night-lambing beanie, glow scarf, lantern cosy |
| **Pāua wool** | `PA` | recessive, shows only if lustre ≥ 5 (masked otherwise) | Romney at 1.5 % | iridescent blue-green-violet shimmer that shifts as the camera turns | show quality: +10 quality in show classes | pāua shawl, a shimmer band on the signature knit |
| **Pōhutukawa wool** | `PO` | **dominant**, sport-only | only from sports | turns crimson in summer, back to its base colour in winter | seasonal colour: counts as vivid red in summer | Christmas jersey, summer-bloom scarf |
| **Southerly wool** | `SO` | recessive | Perendale, Farm at 2 % | fleece swept one way as if in a gale, sheep braced | windproof | southerly-proof bush shirt, storm hat |

**Sports (mutations).** For each lamb and each fantasy locus, a new allele appears in one gamete
with μ = 0.001 (so `PO` enters the game only this way). Mutation lives in `mate()` behind an option
(`genetics/meiosis.ts` stays pure and rng-driven). A sport is just a hidden carrier, and nothing
contradicts until a test or a homozygous lamb does. When `posteriorDiscrete` throws "no consistent
assignment" for a fantasy trait, `knowledge.ts` finds the minimal sheep whose parents' evidence
conflicts and marks `sheep.sport = [locus]` in `state.knownSports`. From then on that sheep is
treated as a founder for that trait, and the player gets a discovery card: *"Clover is a sport, a
brand-new mutation!"* Forecasts still never read the genome.

**Discovery routes:**

1. **A surprise lamb:** two hidden carriers mate. The report has a special reveal: a sparkle and
   Old Tom's *"Well, I'll be. Never seen a fleece do that."*
2. **The vet's rare-gene screen** (from ch3; 20 coins; forecast = expected bits over the six
   loci).
3. **The kiwi** (§8): once a year, a free screen of the sheep you know least about.
4. **Visiting rams** (ch4) are sometimes "from down south, says he's got something special",
   with a 25 % carrier chance at one fantasy locus. It shows as a wider "rare wool" band in the
   forecast.

The codex gets a **Rare wools** page: six silhouettes that fill in when first seen, with a line
of lore in the kiwiana voice (not Māori lore).

---

## 5. Fibre pipeline: the seasonal woolshed

### 5.1 Flow

```
shear ─► Wool store (fleece lots, auto skirted & washed) ─┬─► sell raw to Sheryl (wool buyer)
                                                           └─► Woolshed queue:
            card ──► batt/roving ──┬──► felt ──────────────► felted item
                                   └──► spin ──► yarn skein ─┬─► knit ─► knitted item
                                                             └─► weave ─► woven item
```

- **Shearing** stays every season for adults, so the v2 economy rhythm holds. Hemi's gang
  shears and each adult gives one **fleece lot**: kg, µm, staple, crimp, lustre, colour hex,
  family, intensity, fantasy tag, wool type, and the donor's fondness.
- **Skirting and washing** is automatic. Clean weight = greasy × yield: Fine 0.65, Medium 0.70,
  Strong and Crossbred 0.75, Lustre 0.75, Carpet and Lopi 0.80 (real-ish scouring yields).
- **Wool store** capacity: 12 lots; the woolshed upgrade raises it to 24, the wool press to 40.
  Overflow goes to the wool buyer automatically at the raw price, and the report says so.
- **Auto-sell raw** toggle, on by default until the woolshed opens (ch2). Early play then feels
  like v2 with no micromanagement.
- **Stock you can hold:** fleece lots, batts (carded), yarn skeins (spun, with colour and weight),
  and finished items. Each can be sold at a rising value per kg.
- **One stage per job per season.** A job advances at most one stage each sleep, so socks from a
  fleece take three seasons (card, spin, knit): "card → spin → knit over seasons". Knitting from
  **yarn already spun** takes one season, so planning yarn ahead in colours is where the skill
  lies.

### 5.2 Benches (capacity per season)

| Bench | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| Carding | hand carders (free, ch2): 2 kg | drum carder (60 c): 6 kg | the village carding mill share (200 c): 15 kg |
| Spinning | drop spindle (free): 1 kg | spinning wheel (80 c): 3 kg | a second wheel and Aunty Mere's circle (180 c): 6 kg |
| Knitting | your needles: 4 pts | knitting circle joins (5 c a season, ch2): +4 pts | a knitting-circle hall night (150 c): +6 pts |
| Weaving | none | table loom (120 c, ch3): 4 pts | floor loom (300 c, ch4): 10 pts |
| Felting | felting table (30 c, ch2): 4 pts | wet-felting sink (70 c): 8 pts | none |

Tiers also cut craft noise (§5.3). The v2 `shearing` upgrade becomes **the woolshed**: wool store
24, raw price ×1.25 (kept), and the notice board moves onto its wall.

### 5.3 Quality and the job forecast

For a job (recipe + chosen lots or yarn):

```
Q = 100 × Fit × Fine × Staple × Colour × Even × (1 + Care) + noise,   clamped 0..100
```

- **Fit:** the wool-type suitability for the recipe (§6): ideal 1.0, good 0.8, poor 0.55, no
  (not allowed).
- **Fine:** `1 − 0.04 × max(0, µm − recipe.targetµm)`, floor 0.4.
- **Staple:** 0.7 if staple is below the recipe's minimum (spinning 50 mm, lopi 100, rug 120),
  otherwise 1.
- **Colour:** natural-colour recipes 1.0. Coloured patterns: if the family matches, `min(1, 0.6 +
  0.4 × I / I*)`; wrong family 0.5.
- **Even:** a blend of several lots gets `1 − 0.5 × sd(intensity)`, floor 0.7.
- **Care:** mean fondness of the donor sheep maps 0 → −5 %, 40 → 0, 100 → +10%. The care
  mechanic carries into crafting.
- **Noise:** N(0, σ), with σ = 10 at tier 1, 6 at tier 2, 3 at tier 3, and σ × (1 − 0.08 × hands).
  **Hands** is a per-craft skill of 0–5 from jobs completed (thresholds 1, 3, 6, 10, 16). It's
  the job system's *learn* currency: the band visibly narrows.
- **Stars:** < 35 ★, 35–55 ★★, 55–70 ★★★, 70–85 ★★★★, ≥ 85 ★★★★★.

**Job forecast** (shown before *Queue it*): a star band (the 10th to 90th percentile of Q), the
finish season, and a coin band of `base × (0.5 + Q/100) × m(D_at_finish)`. `D_at_finish` projects
the item's demand meter through refills minus your already-queued units of that item (§7). Words
first; numbers with the `numbers` unlock. The report shows each finished item flipped next to the
forecast seen, like lambs: *"Forecast ★★★–★★★★, made ★★★★. Ka pai!"*

---

## 6. Items and patterns

### 6.1 Wool type suitability

◎ ideal (1.0), ○ good (0.8), △ poor (0.55), × not allowed.

| Item (stage) | Fine | Medium | Strong | Lustre | Carpet | Lopi | Crossbred |
|---|---|---|---|---|---|---|---|
| Socks (knit) | ◎ | ○ | △ | × | × | △ | ○ |
| Baby shawl (knit) | ◎ | △ | × | × | × | × | × |
| Beanie (knit) | ○ | ◎ | ○ | △ | × | ○ | ◎ |
| Mittens (knit) | ○ | ◎ | ○ | △ | × | ◎ | ○ |
| Gumboot socks (knit) | △ | ○ | ◎ | ○ | × | ○ | ◎ |
| Scarf (knit) | ◎ | ◎ | △ | ○ | × | ○ | ○ |
| Lopapeysa (knit) | × | △ | △ | △ | × | ◎ | △ |
| Bush shirt (weave) | × | ○ | ◎ | ○ | △ | △ | ○ |
| Rug (weave) | × | × | ○ | ○ | ◎ | △ | △ |
| Felted slippers, tea cosy, felt kiwi toy (felt) | ◎ | ◎ | ○ | △ | △ | ○ | ○ |
| Dryer balls (felt) | ○ | ○ | ○ | ○ | ○ | ○ | ○ |

This implements the user's pairings: Merino suits socks and next-to-skin knits, Icelandic the
lopapeysa, Romney hardy outer knits, and Drysdale rugs.

### 6.2 Recipes

"Knit pts", "weave pts" and "felt pts" are bench work. Fibre is clean kg.

| Item | Unlock | Fibre kg | Work | Target µm | Colour rule | Base price (c) | Sale step |
|---|---|---|---|---|---|---|---|
| Dryer balls ×4 | ch2 start | 0.2 | felt 0.5 | 35 | any | 4 | 0.05 |
| Socks | ch2 start | 0.2 | knit 2 | 23 | any | 14 | 0.10 |
| Beanie | ch2 start | 0.15 | knit 1 | 28 | any | 12 | 0.10 |
| Gumboot socks | own a Strong or Crossbred lot | 0.3 | knit 2 | 34 | natural | 10 | 0.08 |
| Mittens | first yarn spun | 0.15 | knit 1.5 | 29 | any | 12 | 0.10 |
| Tea cosy | felting table | 0.2 | felt 1 | 30 | any | 9 | 0.12 |
| Felted slippers | felting table and ★★★ hands | 0.35 | felt 2 | 28 | any | 18 | 0.12 |
| Felt kiwi toy | the kiwi befriended | 0.1 | felt 1 | 30 | brown or charcoal | 16 | 0.15 (tourists) |
| Scarf | 3 skeins spun | 0.3 | knit 2 | 25 | any | 16 | 0.10 |
| Two-colour beanie | own 2 families with I ≥ 0.3 | 0.2 | knit 1.5 | 28 | 2 colours | 22 | 0.12 |
| Baby shawl | a fleece ≤ 19 µm | 0.4 | knit 4 | 19 | pastel or white | 30 | 0.20 |
| Lopapeysa (natural) | own a double-coated sheep | 0.8 | knit 8 | 30 | 2–3 naturals | 60 | 0.25 |
| **Red lopapeysa** | double coat and a red with I ≥ 0.6 | 0.8 | knit 8 | 30 | vivid red body | 90 | 0.30 |
| Rainbow scarf | 5 families with I ≥ 0.5 | 0.35 | knit 3 | 25 | 5 colours | 70 | 0.30 |
| Bush shirt | table loom and a Strong lot | 1.0 | weave 6 | 34 | check of 2 colours | 55 | 0.25 |
| Rug | table loom and a Carpet lot | 2.5 | weave 8 | 45 | any | 70 | 0.30 |
| Cloud socks / beanie | cloud wool shorn | 0.06 / 0.05 | knit 2 / 1 | 21 | any | 80 / 70 | 0.35 |
| Steel fencing gloves / gaiters | steel wool shorn | 0.2 / 0.4 | knit 2 / weave 4 | 32 | any | 70 / 110 | 0.35 |
| Glow scarf / night beanie | glow-worm wool shorn | 0.3 / 0.15 | knit 2 / 1 | 27 | any | 90 / 75 | 0.35 |
| Pāua shawl | pāua wool shorn | 0.4 | knit 5 | 24 | any | 150 | 0.40 |
| Christmas jersey | pōhutukawa wool shorn | 0.8 | knit 8 | 28 | summer only | 140 | 0.40 |
| Southerly bush shirt | southerly wool shorn | 1.0 | weave 6 | 32 | any | 130 | 0.40 |
| **Signature knit** | ch5 | 0.9 | knit 10 | 28 | ≥ 3 of your bred colours with I ≥ 0.5, plus one fantasy yarn band | 250 (show piece) | 0.50 |

A job's sale step is how much one sale lowers that item's demand (§7). Unlocks show as a
*"New pattern!"* card in the report, with the reason (*"because you own Poppy, a vivid red"*). The
woolshed panel lists locked patterns as silhouettes with their unlock hint, which gives the player
something to aim for.

---

## 7. Market and demand meters

Every sellable good (each item, plus raw wool by type) has a **demand meter** `D` from 0 to 1.5.

- **Price** = `base × qf × m(D)`, with `qf = 0.5 + Q/100` (★★★ ≈ 1.1) and `m(D) = 0.4 + 0.6 D`
  (from 0.4× when saturated to 1.3× during a spike).
- **Selling** one unit: `D -= step` (per item, §6.2), with a floor of 0.
- **Refill** each season toward a seasonal target `T`: `D += 0.3 (T − D)` when below, and
  `D -= 0.25 (D − T)` when above. `T` is 1.0 by default; winter beanies, mittens and gumboot
  socks 1.2 (summer 0.8); summer tourists raise the felt kiwi toy and tea cosy to 1.3; show
  season (autumn) crafts 1.1.
- **Orders spike demand:** posting a villager order for an item gives that item +0.2 ("word gets
  round"), and filling it pays the order reward without touching `D`.
- **The A&P show** (autumn) gives the featured craft class's item +0.5 for that season.
- **Events:** *cold snap* (beanies and mittens +0.4), *tourist bus* (souvenirs +0.4), *wool glut*
  (raw −0.3). They are announced a season ahead like v2's `woolBoom`, so they're decisions.
- **Raw wool** still sells so the early game works. Price per greasy kg: Fine 1.4, Medium 1.0,
  Strong 0.8, Crossbred 0.8, Lustre 0.9, Carpet 0.7, Lopi 1.1. Multipliers: × (1 + 0.6 × I),
  × woolshed 1.25, × fondness (kept), × fantasy 3.0, × m(D_raw). Raw meters use step 0.01 per kg
  and refill 0.5, so they sag only a little. That keeps year-1 income within ±15 % of v2's
  (v2 medium white ≈ 1.1 c/kg). Batts pay 1.6× raw per kg and yarn 2.5×.
- **Sustainable mix:** at step 0.10 and refill 0.3, about three units of one knit per season hold
  m ≈ 0.8. Selling seven drops it to 0.4×. The market card draws each meter as a little jar
  filling back up and forecasts "after you sell N" before the Sell button.

**Money targets** (median blind farmer; the phase sims check these):

| Year | Flock | Net per season | Main income |
|---|---|---|---|
| 1 | 5–8 | +10 to +25 | raw wool (auto-sell) |
| 2 | 8–12 | +25 to +60 | raw + first knits (socks, beanies, dryer balls) |
| 3 | 12–16 | +60 to +120 | knits, felt, first lopapeysa or rug; crafted ≥ 50 % of income |
| 4+ | 16–30 | +120 to +250 | coloured and fantasy items, orders, show prizes |

Feed stays `feedPerHead` (2 → 6 c). Sinks: benches (≈ 1000 c in total), bush planting, bird
kai, breeds at the market, vet screens. Sales HHI (the concentration of item types sold per year)
should be below 0.4 from year 3. That's the balance-sim check for "encourages a mix".

---

## 8. Native bird helpers

Birds reuse `care.ts`. A bird is a care record keyed by bird id (`CareRecord`, fondness 0–100):
greeting it (opening its card at the bush edge) gives +8 once a season, and **kai** (the bird's
treat) gives +15 once a season at the bird's cost. Birds are wild, so their powers scale with
fondness: off below 40 ("Wary"), half strength at 40, full at 80+ ("Devoted"), linear between.
Ignored with fondness < 10 for 2 seasons, a bird leaves; it returns once its conditions hold again
and you greet it.

| Bird | Arrives when | Kai (cost) | One gentle power | Limits and quirks | Forecast shown (Decide → Forecast) |
|---|---|---|---|---|---|
| **Pīwakawaka** (fantail) | first shearing in ch1 (it follows you for insects). The tutorial bird for trust. | none: greeting only | catches sandflies and blowflies: no **flystrike** (new summer event: one fleece lot spoiled) and +2 on each sheep greeting | flits off in winter (no power) | "Flystrike risk this summer: likely → long shot with the fantail" |
| **Tūī** | ch2, after **Plant the bush edge I** (harakeke and kōwhai, 40 c) | sugar-water feeder, 1 c | sings over the paddock: greeting one sheep also greets its paddock-mates (+4 each, once a season) | none | flock hearts before → after, and the wool/quality bonus in coins |
| **Kākā** | ch3, after **Bush edge II** (native fruiting trees, 90 c) | fruit, 2 c | scouts the village: shows next season's demand meters (the band narrows with fondness) and one "Kākā tip" item | raids the orchard once a year (−2 c, a funny line); chews a gumboot | per item: demand now → next season, with a band |
| **Ruru** (morepork) | ch3, after a **nest box** in the old macrocarpa (35 c) | none: it hunts | night watch: announces predators and events one season earlier, fox chance ×0.8, and catches mice at half the cat's rate | a night bird, greeted only in the evening report | predator and mice risk meters now → with ruru |
| **Kiwi** | ch4, needs Bush edge II, **kiwi-aversion training** for your dogs (30 c, once) and **a bell collar for Mog** (5 c) or no cat | grubs and a leaf-litter log, 2 c | forages at night: once a year, a free rare-gene screen on the sheep with the most fantasy-gene uncertainty; unlocks the felt kiwi toy and finds one **berry dye** (pastel only, max I 0.3; open question Q2) | shy: skips the season if a dog is untrained | "Odds the kiwi finds a rare-gene carrier this year: …" (from posteriors) |
| **Kea** (optional) | ch5, when the high-country paddock opens | none: it can't be bought, only won by patience | tests one steel or strong item a season: if it can't wreck it, the item is **Kea-proof** (+20 % price) | at low fondness a 20 % chance a season it pinches a small item | "Chance the kea wrecks this item: …" from its quality |

The conservation trade-offs are real NZ lessons, told lightly: cats and untrained dogs keep kiwi
away, and planting brings birds. None of this is punishing, and every condition shows as a plain
checklist on the bird's card.

**UI and world:** birds get an animal card like the dogs and cat (`animalCardHtml` generalised to
`PetId | BirdId`), the same heart meter, a kai button, a power box with its forecast, and a line in
the board's "Your animals". They sit on bush-edge perches (`WorldSnapshot.birds`), fly to the
visited sheep or the woolshed, and have short calls in `audio/` (tūī chime and click, ruru
"more-pork", kākā screech, kiwi whistle, fantail cheep).

---

## 9. The farm: a river valley

An organic valley replaces the square diorama. It's still a static batched mesh, but the camera
pans along the valley (drag or arrow keys, with snap-to-hotspot) instead of framing everything at
once.

```
                        ^^^^^^^ snowy tops ^^^^^^^
                  .-~~~~  HIGH COUNTRY (ch5, kea)  ~~~~-.
              .-~   .....tussock.....   |       ngahere   ~-.
           .-~    HILL PADDOCK (ch4)    |   NATIVE BUSH EDGE  ~.
         /     ___ terraces ___        / \  (tūī, kākā, ruru,   \
        |     /  CREEK FLATS  \  awa  /   \  kiwi; perches)      |
        |    |    (ch2, +4)    | ~~~~ |nest box   bush plantings |
        |  [HOMESTEAD]  [WOOLSHED]  ~~~~~~   [VET'S UTE STOP]    |
        |   garden, gumboots  yards  ~~bridge~~                 /
         \  HOME PADDOCK (start, cap 10)  ~~~~   [MAILBOX]      /
          `-._________ road _________~~~~________________ _.-'
                   \                  ~~~~
                    `--> MĀNUKA FLAT village: Sheryl's store & wool buyer,
                         A&P SHOWGROUND (bunting, grandstand, pavlova tent)
```

| Zone | Opens | Flock cap | Notes |
|---|---|---|---|
| Home paddock | start | 10 | by the homestead; lambs stay here |
| Creek flats | ch2 (v2 `paddock`, 120 c) | +4 | across the little bridge |
| Hill paddock (terraces) | ch4 (v2 `meadow`, 300 c) | +6 | up the slope; fences follow the contour |
| High country | ch5 (400 c) | +8 | tussock and snow tussock, kea |
| Native bush edge | ch2 (plantings) | none | birds only; grows visibly with each planting |
| Homestead | start | | sleep, settings (v2 `house`) |
| Woolshed | ch2 panel (visible from start) | | woolshed queue, wool store, notice board (v2 `shed`) |
| Vet's ute stop | ch1 | | vet panel |
| Village and showground | start (market), ch3 (show) | | market, wool buyer, A&P show |

`WorldSnapshot` gains `zones: ZoneId[]`, `bushLevel: 0|1|2`, `birds`, `woolshedTier`, and
`showToday`. The world keeps its hard rule of zero imports from `core/`. The new hotspot is
`woolshed` (replacing `shed`), `fairground` becomes `showground`, and `birds` are pickable like
pets.

---

## 10. Progression

### 10.1 Chapters

Blue becomes one milestone, and the long goal is the Golden Fleece.

| Ch | Title (villager line) | Goal to advance | Unlocks on entry | Target (blind median, cumulative seasons) |
|---|---|---|---|---|
| 0 | The old farm ("The farm's yours, love. Let's see what the flock gives us.") | first lambs | forecast (swatch litter), facts | 1 |
| 1 | Hidden colours ("White on top, colour underneath!") | a lamb with a visible colour at I ≥ 0.3 **and** 3 shearings sold | cards, vet, orders, the fantail | 5 |
| 2 | The woolshed (Aunty Mere: "Wool's worth more with a bit of mahi in it.") | sell 5 different item types and fill 2 orders | woolshed, benches, demand meters, patterns, creek flats, bush edge I, tūī | 11 |
| 3 | True blue (Old Tom: "Now, a *blue* one. That'd turn heads at the show.") | a true-blue sheep (§2.2) and a ribbon (1st–3rd) at the A&P show | numbers, A&P show, Merino/Icelandic/Drysdale, loom, kākā, ruru, rare-gene screen | 18 |
| 4 | Fresh blood and rare wool (Barry: "Reckon you'll never beat my Romneys.") | shear your first fantasy fleece and win 1st in any show class | family tree, visiting rams (incl. "from down south"), hill paddock, kiwi | 27 |
| 5 | The Golden Fleece (the show committee's letter) | win the Golden Fleece (§10.2) | signature knit, high country, kea; afterwards endless mode | 36 |

The blind farmer's target stays at least 80 % of seeds reaching the ending, now within 60
seasons. v2 ch1 (blue) took a median of 10 seasons, so v3 reaches true blue by about 18, with
the woolshed in between.

### 10.2 The Golden Fleece (concrete)

At any autumn A&P show from ch5, the **Supreme: Golden Fleece** class opens. You enter a
collection, and the entry wins when all three hold on show day:

1. **Rainbow:** six living flock sheep, one each of red, orange, yellow, green, blue and purple,
   each at I ≥ 0.6 and not dilute. The same sheep can't count twice.
2. **Rare wool:** a living sheep showing any fantasy wool, with a fleece of it in the store or
   used this year.
3. **Signature knit:** one *Signature knit* made at ★★★★ or better (quality ≥ 70).

It's deterministic: no judge roll on the supreme, so no heartbreak. The show panel shows the
checklist with swatches, and the forecast for the decision is *"Will your collection be complete
by autumn?"*: the odds from current sheep plus planned lambs (Monte Carlo over forecasts, like
`forecastOrder`). The ending is the valley at the show: bunting, pavlova tent, Barry shaking your
hand, the birds on the grandstand rail.

### 10.3 The A&P show (replaces the fair)

Every autumn from ch3, with **two classes** a year: one sheep class and one craft class, rotating.

- **Sheep classes:** Best coloured sheep (a named family, judged on I and depth), Finest fleece,
  Best longwool (staple and lustre), Best of breed (a named breed; purebred ≥ 75 %), Rare wool (ch4+).
- **Craft classes:** Best socks, Best lopapeysa, Best rug, Best felt (judged on item Q plus a judge
  roll, `FAIR_JUDGE_SD` kept).

The field strength curve (`FAIR_FIELD_*`) is kept. Prizes are 30/15/8 plus a rosette (sheep) or
ribbon (item; ribbon items sell at ×1.2). The show forecast is unchanged in form: your entry
against the expected field.

### 10.4 Orders

Kinds: `colour` (a sheep of family X at I ≥ y), `item` (N of item at ≥ k★ by a season, the new
main kind), `wool` (kg of a wool type under M µm; replaces micron-only), `horns` (kept). There are
still at most 3 open and 2 accepted, and `forecastOrder` extends to items: P(fill) from the queue
forecast plus stock.

### 10.5 Tutorial changes

The ten-step tutorial stays and is re-skinned. Its white pair is now `w/W` over hidden pigment
(the ewe carries red doses, the ram yellow), and the first lamb is rerolled until coloured (as
now), so the surprise is an orange or red lamb from two whites. The words change from "black
underneath" to "colour underneath". The goal step names the Golden Fleece as the long dream and
blue as a milestone.

A second, short **woolshed tutorial** (four steps, Aunty Mere) runs on entering ch2: open the
woolshed → queue socks from a fleece (read the forecast) → sleep → see the job advance and sell
the finished socks. It uses the same `tutorial` machinery with a `track: "woolshed"` field, is
skippable, and is probe-played.

---

## 11. What stays, changes and goes

| v2 system | v3 |
|---|---|
| Forecast panel, notebook facts, discovery cards, codex | **Stay.** Swatch litter, pigment dots, new goal tabs, Rare wools page |
| Inference engine | **Stays.** More small traits, masking, sport handling, benchmark test |
| Acts 0–4 | **Change** to chapters 0–5 (§10); the registry goal (6 blues ≤ 24 µm) **goes** |
| Orders | **Change:** item orders added, colour orders use families, wool orders use wool types |
| Fair | **Becomes** the A&P show with sheep and craft classes plus the Golden Fleece |
| Visiting ram | **Stays**, with a breed tag and sometimes a rare-gene carrier |
| Vet | **Stays** with new tests (pigment channel, rare-gene screen) |
| Dogs, cat, fondness, mice | **Stay.** Birds join; kiwi conditions touch dogs and cat; fondness feeds item quality |
| Events | **Stay**, plus flystrike (summer), cold snap, tourist bus and wool glut; `woolBoom` becomes "wool buyer's bonus" on a family |
| Wool income per season | **Changes:** shearing fills the wool store; raw wool sells to the buyer (auto-sell early) |
| Farm improvements | `paddock` becomes creek flats, `meadow` hill paddock, `shearing` the woolshed, `barn` stays; benches, plantings and nest box are new |
| Milk trait | **Goes** (loci repurposed) |
| Personalities, voices, portraits, live portrait | **Stay** |

### Save migration (v2 → v3)

`deserialize` gains `migrateV2(raw) → GameState{version: 3}`. It is deterministic and tested on
fixture saves from each v2 act.

1. **Genomes are remapped haplotype by haplotype.** Each new locus is a function of one old locus
   on the same haplotype, so every child still inherits consistently from its parents and
   inference can't hit contradictions.

   | New locus | Source | Mapping |
   |---|---|---|
   | `W` | `A` | `a → w`, `Aw → W` |
   | `U1` | `D` | `d → +` |
   | `U2` | `B` | `B → +` |
   | `R1`, `R2`, `Y1`, `Y2` | `D` | `D → +` |
   | `Dl`, `DC`, `N`, fantasy | none | common allele (`D`, `dc`, `n`, plain) |
   | `SL1–4`, `LU1–3`, `CD1–4`, `FN6` | `MK1–4`, `FW*` copies | copy the source allele |

   Result: old **blue** (B/_, d/d) → blue dose 3–4, no red or yellow, so **blue stays true blue**.
   Old **black** (B/B D/D) → r4 y4 b2, brown (russet). Old **brown** (b/b D/D) → r4 y4, orange-rust.
   Old **fawn** (b/b d/d) → b2, a soft blue. Whites stay white with remapped hidden pigment.
2. **Phenotypes.** Discrete phenotypes are recomputed. Old quantitative phenotypes (fineness,
   weight, crimp, size, boldness) are **kept**. New ones (staple, lustre, depth) are drawn from the
   genome with a migration RNG `createRng(seed ^ 0x5a3e)`, leaving the game RNG untouched.
3. **Breed:** every existing sheep is "Farm". Market stock is regenerated.
4. **Knowledge:** `tested.A` becomes `tested.W`; `tested.B` and `tested.D` are dropped; `known` is
   rebuilt by `updateDiscoveries` without minting cards; old discovery cards are kept as history.
5. **Progress:** act 0 → ch0, 1 → ch1, 2 → ch2, 3 → ch3 (blue counts if any living sheep is true
   blue), 4 or ending shown → ch4 (with the Golden Fleece still ahead). Money, upgrades
   (renamed), pets, care and stats carry over. `bluesBorn` feeds a new `stats.families` count.
6. **Open orders:** colour orders are remapped to families (black → brown, brown → orange, fawn →
   blue); if unfillable, they are cancelled with no reputation loss. Any fair entry is cleared.
7. The log says: *"Your farm has moved to Kōwhai Creek. The old flock settled right in, and some
   colours look a little different in the valley light."*

The localStorage key moves to `blue-sheep-save-v3`. The v2 key is read once and migrated, and the
v2 save is left untouched as a backup.

---

## 12. Presentation

- **Art direction.** Low-poly and flat-shaded as now, with a warmer NZ palette: tussock gold
  `#C9A25A`, flax green `#4F6B3A`, bush green `#2E4A2C`, kōwhai yellow `#E8C23A`, pōhutukawa red
  `#B8232F`, creek blue `#5C9EB8`, corrugated-iron grey roofs, and a red woolshed. Light is golden
  hour by default, with long soft shadows. Snow on the tops in winter, kōwhai bloom in spring,
  pōhutukawa red in summer.
- **Gentle magic** is visual only: glow-worm pinpricks in the bush at dusk, a sparkle trail when a
  rare fleece is shorn, birds leaving tiny shimmering motes on the sheep they helped.
- **Birds:** chunky and round with big eyes, matching the chibi sheep. Signature features: the
  tūī's white throat tufts, the kākā's orange underwings when it flaps, the ruru's huge yellow
  eyes, the kiwi's long bill, the fantail's fanned tail flicking, the kea's olive body with orange
  flash.
- **Infographics:**
  - **Pigment dots** on every card: three rows of ●●○○ for red, yellow and blue, plus a pale or
    full chip and a strength bar.
  - **Paint triangle:** an RYB triangle in the forecast where the ten lamb swatches sit at their
    mix positions. The parents are pins and the target family is a shaded region.
  - **Swatch litter:** ten lamb portraits tinted in their forecast colours.
  - **Rainbow ring:** the Golden Fleece tracker, six segments that light up as you own each family
    at I ≥ 0.6.
  - **Demand jars** on the market, and a **job card** per woolshed bench with stars band and coin
    band.
- **Sheep looks by breed** (procedural, in `sheepMesh.ts`): Merino has dense small puffs and a
  neck fold; Romney has long wavy locks; Drysdale is hairy with horns on both sexes; Icelandic is
  shaggy with an outer coat over a short inner coat and horns; Perendale is neat and compact.
  Fantasy looks are in §4 (steel metallic material, cloud hover and bob, glow emissive at night,
  pāua hue shift with view angle, pōhutukawa seasonal tint, southerly swept puffs).
- **Blender model refresh (later).** Blender is not installed. Proposal:
  - Scripts `packages/game/art/blender/*.py`, one per asset (woolshed, homestead, bridge, birds,
    dogs, cat, trees), built from primitives and bmesh with vertex colours, flat shading and
    < 3k triangles each.
  - `blender -b -P packages/game/art/blender/build_all.py -- --out packages/game/public/models`
    exports `*.glb` (`bpy.ops.export_scene.gltf(export_format='GLB', export_colors=True)`).
  - The generated `.glb` files are committed (target < 150 KB each), so builds and CI never need
    Blender.
  - world3d loads them with `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js` through
    a small `models.ts` cache (`loadModel(id): Promise<Object3D>`). The procedural builders stay
    as fallbacks and are used until a model resolves, so headless probes stay deterministic.
    `debugStats().models` lists what loaded.
  - Sheep stay procedural, because phenotype drives geometry. The pet polish backlog items (collie
    overlap, lying Maremma, emoji market cards) fold into this pass.

---

## 13. Phased implementation plan

Each phase is one agent session (~1–2 h), keeps the game playable, updates `CONTRACTS.md` for
what it touches, and ends with `npm test`, `npm run typecheck`, `npm run probe` and a look at the
screenshots. Balance tuning stays out of feature commits: each phase runs the sims and reports,
and tuning is a separate commit only if a target is badly missed.

### Phase 1: Genetics v3 library (game untouched)
- **Scope:** new species `sheep3` (chromosomes 0–5: pigment, `W`, `Dl`, `S`, `P`, `DC`, `N`, six
  fantasy loci, fleece QTLs incl. staple, lustre and depth); `breeds.ts` (`BreedSpec`,
  `sampleFounder` with freq overrides); `colour.ts` (`woolColour`, families, intensity, RYB mix);
  `mate()` mutation option; `DiscreteTrait.maskedBy`; inference honours masking.
- **Files:** `packages/genetics/src/{sheep3,breeds,colour,meiosis,traits}.ts`,
  `packages/inference/src/constraints.ts`.
- **Tests:** breed means within tolerance (2000 founders); dose ratios χ²; the §2.2 colour example
  table; Merino × Romney in between; masked-trait posterior equals exact enumeration on a
  6-sheep pedigree; benchmark: all 15 traits on 200 sheep < 600 ms.
- **Probe:** `probe:quick` still green (no game change).
- **Sim:** a new `scripts/palette.ts` prints the breed table and writes `probe/out/palette.html`
  (all 125 × 2 swatches with family names); screenshot it with the probe lib.
- **Demo:** the palette sheet and the breed table.

### Phase 2: The game switches to pigment colour, plus save migration
- **Scope:** `core/state.ts` uses `sheep3`; `knowledge.ts` gets the new trait list, masked
  individuals, `LOCUS_WORDS` for pigments ("passes one red dose to every lamb"); `forecast.ts`
  colour classes, swatch allocation and colour goal tabs; ch1 goal temporarily "true blue" (the
  v2 act ladder otherwise kept); `WorldSheep.wool` hex plus `family`; the forecast swatch litter
  and card pigment dots; vet pigment test; `migrateV2`; save key v3; tutorial pair re-rolled on
  `W`.
- **Files:** `core/{state,knowledge,forecast,vet,tutorial,acts,economy,types}.ts`,
  `ui/{forecast,sheep,vet}.ts`, `world3d/{types,sheepMesh,portrait}.ts`, `app.ts`, `CONTRACTS.md`.
- **Tests:** v2 fixture saves (acts 0–4) migrate; blue stays true blue; the posterior succeeds on
  every migrated pedigree; the tutorial lamb is coloured; determinism.
- **Probe:** the forecast shows exactly 10 swatches, each with a valid hex; every born lamb has a
  family; a new `migrate.mjs` injects a v2 save into localStorage, boots, and asserts version 3,
  the same flock ids and no console errors.
- **Sim:** `blind.ts` brain uses colour posteriors; true-blue median seasons reported (target
  8–16).
- **Demo:** coloured sheep in the field; the swatch litter in the forecast; an old save loads.

### Phase 3: Breeds and wool types
- **Scope:** market stock by breed and chapter; the breed line (`breedFractions`); `core/wool.ts`
  `woolType`; staple and lustre on the card; the wool type tag; breed looks in `sheepMesh`
  (locks, shag, horns, fold).
- **Files:** `core/{wool,state,economy,config}.ts`, `ui/{sheep,farm}.ts`,
  `world3d/{sheepMesh,types}.ts`.
- **Tests:** the classification table (one per row plus boundaries); crossbred fractions; market
  availability per chapter.
- **Probe:** at `?act=3` the market offers ≥ 3 breeds; the card shows a wool type consistent with
  `woolType(phenotype)`; screenshots of each breed's portrait.
- **Sim:** fineness distribution by breed over 30 seeds.
- **Demo:** buy an Icelandic ewe, see "Lopi" and the shaggy coat.

### Phase 4: Wool store, raw sales and demand meters
- **Scope:** shearing makes fleece lots (`core/woolstore.ts`); washing yields; store capacity and
  overflow; the auto-sell toggle; `core/demand.ts` (meters, refill, seasonal targets, events); the
  market panel's wool buyer with meters and "after you sell" forecasts; v2 `woolIncome` removed
  from `sim.ts`.
- **Files:** `core/{woolstore,demand,sim,economy,events,config,types}.ts`, `ui/{farm,report}.ts`,
  `app.ts` (`sellLot` action), `probe/play.mjs`.
- **Tests:** meter maths (step, floor, refill, spike); determinism; year-1 income within ±15 % of
  v2 on seeds 1–20.
- **Probe:** after a sleep the store gains one lot per adult (minus auto-sold); selling three lots
  lowers that raw meter and pays the forecast amount; money ≥ 0 across 12 seasons.
- **Sim:** money curve for year 1 against §7 targets.
- **Demo:** the woolshed store with fleece lots, and meters dipping as you sell.

### Phase 5: Woolshed queue, items and patterns
- **Scope:** `core/craft.ts` (recipes, benches, jobs, one stage per season, quality, hands,
  `forecastJob`); pattern unlocks and cards; item sales through demand; bench upgrades in
  `UPGRADES`; the woolshed panel (three bench columns with job cards, locked pattern silhouettes);
  the report flips finished items next to their forecasts; the ch2 woolshed tutorial.
- **Files:** `core/{craft,config,sim,upgrades,tutorial,types}.ts`,
  `ui/{woolshed,report,tutorial}.ts`, `app.ts` (`queue`, `cancelJob`, `sellItem`), `probe/panels.mjs`.
- **Tests:** the quality formula per factor; noise band coverage (80 % band holds about 80 % of
  outcomes over 500 jobs); the stage timeline; no job advances two stages in one season.
- **Probe:** queue socks from a fleece and sleep ×3, and the item exists with Q inside the 10–90
  band seen (one retry seed allowed); selling it lowers socks demand by 0.10; the woolshed
  tutorial plays by clicks.
- **Sim:** the policy crafts; crafted share ≥ 50 % of year-3 income; sales HHI < 0.4.
- **Demo:** knit the first socks and see them sell for more than the raw fleece.

### Phase 6: Fantasy wools
- **Scope:** rare alleles in breed specs and visiting rams; sports (μ) and the sport detection in
  `knowledge.ts`; the rare-gene screen at the vet; the surprise-lamb reveal; the Rare wools codex
  page; fantasy looks in world3d; fantasy recipes.
- **Files:** `core/{knowledge,vet,visitor,sim,craft,config}.ts`, `ui/{codex,report,vet}.ts`,
  `world3d/sheepMesh.ts`.
- **Tests:** a forced sport plus a contradicting test gives a card with no throw; carrier × carrier
  gives about 25 % showing; the screen's forecast bits are ≤ the entropy.
- **Probe:** a debug fixture (`?act=4&rare=steel`) has a steel sheep with a metallic material
  (`debugStats`), the codex shows one of six filled, and a steel-glove job can be queued.
- **Sim:** the median season of the first fantasy fleece (target ≤ 27 cumulative).
- **Demo:** a cloud-wool lamb bobbing above the grass.

### Phase 7: Chapters, item orders, A&P show, Golden Fleece
- **Scope:** `ACTS` → six chapters (§10.1) with goals and progress; item/wool-type/family orders;
  the fair becomes the A&P show (two classes, ribbons on items); the Golden Fleece checklist,
  forecast and ending; tutorial text updates; the `actTrack` gets six stops; `?act=N` fixtures up
  to 5.
- **Files:** `core/{acts,orders,fair→show,config,tutorial}.ts`, `ui/{board,track,misc,report}.ts`,
  `debug.ts`, `probe/{play,panels,tutorial}.mjs`.
- **Tests:** each chapter goal; Golden Fleece criteria (each missing piece blocks it);
  `forecastOrder` for items; the show's craft class uses item Q.
- **Probe:** `?act=5&golden=1` fixture: sleep to autumn, and the ending panel appears; the chapter
  never decreases over 12 played seasons.
- **Sim:** `blind.ts` to the ending over 30 seeds: ≥ 80 % within 60 seasons, chapter medians
  against §10.1.
- **Demo:** the full arc; the ending at the show.

### Phase 8: River valley map
- **Scope:** new `world3d/farm.ts` terrain (a valley heightfield strip, creek spline, bridge,
  road, bush edge levels, showground in the village); zones and hotspots per §9; camera pan with
  bounds and snap-to-focus; the zone unlocks drive fences and paddocks.
- **Files:** `world3d/{farm,index,types,behave}.ts`, `app.ts` (snapshot fields), `CONTRACTS.md` §4.
- **Tests:** zone rects contain their sheep; no hotspot overlaps.
- **Probe:** each hotspot's `screenPoint` is in view after `focus`; 40 sheep at ≥ 30 fps in
  swiftshader (keep the 60 fps laptop target); screenshots for each season plus `idle.webm`.
- **Demo:** pan the valley from the homestead to the showground.

### Phase 9: Native birds
- **Scope:** `core/birds.ts` (arrival conditions, care records, powers, forecasts); plantings and
  nest box upgrades; kiwi-aversion and bell; flystrike; world3d `bird.ts` (low-poly birds,
  perches, flights); calls in `audio/`; the animal card generalised; the board's animals list.
- **Files:** `core/{birds,care,events,demand,config,upgrades}.ts`, `ui/pets.ts`,
  `world3d/{bird,index}.ts`, `audio/voice.ts`, `probe/life.mjs`.
- **Tests:** each power's effect at fondness 40 and 80; the kiwi is blocked by an untrained dog;
  a bird leaves after neglect.
- **Probe:** planting the bush edge brings the tūī within a season; greeting it floats hearts; the
  kākā card shows next-season demand for ≥ 5 items; the ruru moves an announcement earlier.
- **Sim:** bird power value per season (coins or risk) is ≤ 15 % of income, so they're gentle.
- **Demo:** the tūī singing over the paddock; the kākā's market tip.

### Phase 10: Model refresh via Blender (optional, needs Blender on the box)
- **Scope:** install Blender (headless); `art/blender/*.py`; commit the `.glb` files;
  `world3d/models.ts` loader with procedural fallback; birds, dogs, cat, woolshed, homestead and
  bridge swapped in; the pet polish backlog fixed.
- **Files:** `packages/game/art/blender/`, `packages/game/public/models/`, `world3d/models.ts`.
- **Tests:** loader falls back on a missing file.
- **Probe:** `debugStats().models` lists every expected id; draw calls within +20 % of the phase 8
  numbers; close-up screenshots per model.
- **Demo:** the refreshed woolshed and birds.

---

## 14. Open questions for the user

1. **How many pigment loci per colour?**
   - (a) 2 per colour: 0–4 doses, 125 hues, fast.
   - (b) 3 per colour: 0–6 doses, 343 hues, slower forecasts (27 joints each, ≈ 2× posterior
     time), a longer road to vivid colours.
   - (c) 1 per colour: 0–2 doses, simple, fewer surprises.

   *Recommend (a).*
2. **Dyeing?**
   - (a) None: only bred colour counts.
   - (b) Pastel plant dyes only (the kiwi finds them), capped at intensity 0.3 and never counting
     for the rainbow.
   - (c) Full dyes, bought at the store.

   *Recommend (b):* a little flavour without undercutting breeding.
3. **Shearing rhythm?**
   - (a) Every season, as v2 (keeps the balance and a steady pipeline).
   - (b) Spring and autumn (more realistic, lumpier income).
   - (c) Once a year.

   *Recommend (a).*
4. **Dogs, cat and birds together?**
   - (a) Keep all, with the gentle kiwi conditions (trained dogs, belled cat).
   - (b) Keep all with no interaction.
   - (c) Retire Mog, and let the ruru take the mice.

   *Recommend (a):* a real NZ conservation note, told kindly.
5. **v2 saves?**
   - (a) Migrate with the colour remap (§11: blue stays blue, other colours shift).
   - (b) Start fresh, with an optional "heritage ram" from the old flock.
   - (c) Offer both at load.

   *Recommend (a).*
6. **How strict is the Golden Fleece rainbow?**
   - (a) Six families at I ≥ 0.6, alive at the same time.
   - (b) Four families (red, yellow, blue, green).
   - (c) Six families, collected over the years (photo album), not at once.

   *Recommend (a),* checked against sims; fall back to (c) if the blind median exceeds 45
   seasons.
7. **Kea?**
   - (a) Include it as the optional ch5 bird with a little mischief.
   - (b) Leave it out.
   - (c) Make it the rival's bird, for flavour only.

   *Recommend (a).*
8. **Who does the craft work?**
   - (a) You, plus bench upgrades and Aunty Mere's circle as the only "hire".
   - (b) Hired helpers with wages.
   - (c) Unlimited, with only time as the limit.

   *Recommend (a):* keeps it cosy and the capacity decisions meaningful.
9. **Mutations (sports)?**
   - (a) Yes, rare (μ 0.001), fantasy loci only, and the only source of pōhutukawa wool.
   - (b) No: all rare genes come from founders and visitors.

   *Recommend (a):* it matches the v2 design's act-6 "a colour nobody has seen" hook.
10. **Game title?**
    - (a) Keep "Blue Sheep".
    - (b) "Blue Sheep of Kōwhai Creek".
    - (c) Something new later.

    *Recommend (b):* keeps the brand and tells players the setting.

## 15. Resolved decisions (user, 2026-09-27) — these override anything above

1. **Pigment loci:** 2 per colour (0–4 doses, 125 hues). As designed.
2. **Dyeing:** pastel plant dyes only (the kiwi finds them), capped at intensity
   0.3, never counting toward the Golden Fleece rainbow.
3. **Shearing:** **spring and autumn** (twice a year), not every season. Rebalance
   income, wool store size and the woolshed pipeline around two clips a year.
4. **Pets and birds:** keep all; the kiwi only visits once dogs are trained and
   the cat wears a bell (gentle conservation note).
5. **Saves:** **no migration.** v3 starts fresh with a new save key; drop §11's
   remap work and the "loads an old save" probe from phase 2.
6. **Golden Fleece rainbow:** six colour families at I ≥ 0.6 alive at once
   (fall back to a photo album only if the blind median exceeds 45 seasons).
7. **Birds are the woolshed workforce (replaces "craft labour" and reshapes §8):**
   befriended birds are placed at woolshed stations. Each species has a station
   affinity and a wool affinity; fondness sets how well it works.
   - Kākā: strong beak → carding, best on coarse/strong wools.
   - Tūī: sings a rhythm → spinning, best on fine wools.
   - Pīwakawaka: quick → knitting.
   - Ruru: night shift → +capacity at any station.
   - Kiwi: finds dye plants (pastel dyes) and rare-gene clues.
   - Kea (optional, late): the only bird that can process steel wool; a little
     mischief.
   You still do the work yourself at a base rate; bench upgrades add capacity;
   Aunty Mere's knitting circle remains a one-off help. No wages.
8. **Mutations:** yes, rare (μ 0.001), fantasy loci only; the only source of
   pōhutukawa wool.
9. **Title:** "Blue Sheep of Kōwhai Creek".
10. **Tutorial teaches a Punnet square with horns.** The tutorial pair are both
    polled carriers of horns. Before planning the mating, Old Tom shows a 2×2
    Punnet square (polled/horned, drawn with sheep-head icons and words, no
    letters on screen unless the numbers unlock) predicting about one lamb in
    four horned, and links it to the ten-lamb forecast. After the reveal, he
    reuses the same square to explain the surprise hidden colour. The codex
    keeps the square as a concept card.
11. **Gentle pacing; no extra sheep after the tutorial.** The player keeps the
    tutorial flock and grows it themselves (lambs, market). Remove the
    neighbour/Granny Moss handover. Introduce one new concept at a time over
    the chapters, each only after the previous one has been used; never unlock
    several systems at once. Rebalance oracle/blind sims for the small start.
12. **Fondness:** name kept, numbers kept; add brushing on the live portrait as a
    third once-per-season way to build it. Dogs stay as built.
13. **Time-staggered concepts with mini-lessons (user, 2026-09-27):** early
    systems arrive on a calendar, not on use or a timeout, and each arrives
    "the tutorial way": a short skippable Old Tom lesson (2–4 steps, each
    completing on the real action). Schedule: orders after the tutorial
    (year 1); vet at Year 2 Spring; farm improvements at Year 2 Autumn; dogs
    (and foxes) at Year 3 Spring; cat (and mice) at Year 3 Autumn. Act-gated
    concepts (numbers, fair, tree, visiting rams) stay on their acts but never
    arrive in the same season as another concept (queue to the next season).
    Foxes never raid before dogs are on sale. The first letter asks for horns.
14. **Brushing gesture:** press and hold on the sheep (all devices) instead of a
    drag.
15. **Tutorial over three lambings (user, 2026-09-27):** don't front-load. Lamb 1
    (season 1) is a normal white polled lamb and only teaches the loop; lamb 2
    (season 2) is the 1-in-4 horned lamb, after which Old Tom introduces the
    Punnet square; lamb 3 (season 3) is the black lamb, explained with the same
    square. Then market and the goal. Short steps, one concept each.
16. **Friendlier UI overhaul inside v3 (user, 2026-09-27):** current pain points
    are too much text, too many buttons/panels at once, and a web-app look.
    Target style: hand-drawn kiwiana — woodgrain and corrugated-iron frames,
    paper tags, stitched fabric, rounded chunky buttons, gentle bounces, a cosy
    handmade farm-diary feel. Fewer words, more icons and pictures; show only
    the options relevant right now (progressive disclosure). Do this as an
    early v3 phase ("UI foundation": design system + HUD + core panels) so all
    later phases build on it, then apply it to each new screen as it is built.
17. **Onboarding spans 3–4 in-game years (user, 2026-09-27):** after the v3
    rework, the guided introduction (tutorial + calendar mini-lessons) should
    stretch over roughly the first 3–4 years, one concept per season at most,
    covering v3's systems too (pigment colours, breeds/wool types, wool store,
    woolshed stations, birds, fantasy wools, the A&P show). Design the v3
    calendar accordingly (Phase 7 / chapters). Act-concept lessons (numbers,
    fair, tree, visiting ram) are kept. Brushing hold stays 1.2 s. For now the
    v2 letters arrive straight after the tutorial.
18. **Early look-and-feel block (user, 2026-09-27):** reorder phases so that,
    right after Phase 1 (genetics library), come (a) a **style exploration**:
    3–4 distinct art/UI directions for the kiwiana-fantasy look, each shown as
    mockup screenshots of the same scenes (farm overview in the river valley,
    a sheep card, the forecast, the HUD), for the user to pick from; then
    (b) **UI foundation** in the chosen direction; then (c) **river valley map
    + art style + animation pass** (procedural, in code), leaving spaces for the
    woolshed, the native-bush bird edge and the road to the A&P showground.
    Gameplay phases (pigment colours in game, breeds, wool store/market,
    woolshed, fantasy wools, chapters, birds) follow and build on the chosen
    look. The Blender model refresh stays last and optional.
19. **Colour tuning (user, 2026-09-27, after the Phase 1 palette):** keep
    pastel founders with vivid colours ripening over generations; keep blue
    allele frequency and the true-blue bar for now and check in the Phase-2
    blind sims; Icelandic sheep only appear at the market in a later chapter
    (reward after learning colour breeding); add "slate" and "olive" as colour
    names for muted cool hues (usable in orders and words).
20. **Style direction, round 1 picks (user, 2026-09-27):** world style leans
    **C. Misty Pastoral** (soft light, morning mist), but the user wants a
    second round of concepts that show how the map expands pasture over the
    game before committing. Panels: **wool felt and fibrey materials** (felt,
    yarn, knitted and woven textures, embroidered icons, stitching, pom-poms)
    rather than wood/iron or paper. Sheep: **slightly more realistic**, as in
    option C (less chibi/toy). Fonts: handwritten/stamped lettering for
    headings and names only; a clean readable font for numbers, buttons and
    sentences. Watch-out: mist must not wash out sheep colours (colour is the
    core mechanic) — keep mist to distance/edges.
21. **Style round 2 picks (user, 2026-09-27):** panels = **felted wool with
    blanket stitching, plus pom-pom badges** (from the knit variant) for HUD
    badges. Sheep = **the round-2 natural sheep with a friendlier face**
    (slightly bigger, softer eyes so portraits stay charming). Map: the user
    rejected all four zoomed-out concepts as "too close to concept art" and
    wants options that show **what gameplay actually looks like** at play zoom
    (camera framing, how you move around, how expansion appears in play) before
    choosing a layout.
22. **Camera and movement (user, 2026-09-27, style round 3):** camera =
    **close isometric** (one paddock fills the screen, big clickable sheep,
    felt minimap, locked land at the edges with felt price tags). Sheep face =
    the round-3 friendlier face. Movement: the user wants to **try a walking
    farmer in the close-iso view** ("1 or walk around maybe") alongside
    drag-pan + signposts. Next step: a small playable prototype of close iso
    with a walking farmer (camera follows, click-to-walk and WASD, fond sheep
    follow the farmer, interact by walking up to a sheep) versus drag-pan +
    signposts, for the user to try in a browser before choosing.

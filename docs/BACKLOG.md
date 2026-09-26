# Blue Sheep backlog

Ordered queue of work requested by the user and playtesters. Work runs one
subagent at a time. Items move to "Done" with the commit hash.

## In progress / next

1. **Care mechanics** (playtester, 2026-09-27). Familiarity/happiness per animal
   that grows with interaction and raises wool quality and price; dog tiers with
   different protection per predator (fox, wolf); farm cat vs a mice problem.

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

Planned approach: a design pass first (docs/DESIGN-v3.md: genetics model for
continuous colour, fibre pipeline, item/recipe/pattern tree, market saturation,
magic + native birds, act structure without blue as the sole goal, migration of
existing saves), then implementation in phases, each probe-verified.

## Done

- Cute sheep + unique procedural voices (dce5d99).
- Tutorial with two sheep and Old Tom (ad84ef4).
- Presentation pass: personalities, live portraits, infographics (f2942ca).
- Balance pass: farm improvements, economy sinks (dc0d9c2).
- Complete game v1 (45dab0f).

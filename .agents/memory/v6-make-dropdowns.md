---
name: v6 make dropdowns & engine tag matching
description: Why calculator Make/RM-category dropdowns must come from the source validation lists, not from getDistinctMakes.
---

# v6 Make dropdowns must be sourced from the spec, not derived

Calculator Make (RM category) options must be the canonical per-family lists from
the source data-validation (e.g. TLT / Sub-Station / RSJ-BP = `NPG, MAIN/BSEN,
CORE, PG/NTPC`). Do NOT build them from `getDistinctMakes(rm)`.

**Why:** `getDistinctMakes` splits supplier `make` tags on `/`, so it fragments
`PG/NTPC` → `PG` + `NTPC` and `MAIN/BSEN` → `MAIN` + `BSEN`, and it also leaks
internal `Tested`/`TESTED` supplier tags. The engine's `pickRMPriceForCategory`
matches on the FULL tag (or any `/`-split part), so passing the full `PG/NTPC` /
`MAIN/BSEN` string prices correctly — the fragmentation only ever hurt the UI.

**How to apply:** When wiring any new structure family into the calculator
(Phase 2: Sub-Station (P), Fasteners/hwfast, Railways/railc, etc.), define its
dropdowns (Make, Voltage, Grade, weight band, scrap %, proto %) from that
family's source lists in the acceptance spec, and pass the full make string to
the engine. `RSJ Pole - Base Plate ` is `tlt5` schema so it reuses the TLT
Make/Voltage/Grade UI verbatim; the genuinely different families (fasteners,
railways) are not yet exposed in the UI.

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

**How to apply:** When wiring any new structure family into the calculator,
define its dropdowns (Make, Voltage, Grade, weight band, scrap %, proto %) from
that family's source lists in the acceptance spec, and pass the full make string
to the engine. `RSJ Pole - Base Plate ` is `tlt5` schema so it reuses the TLT
Make/Voltage/Grade UI verbatim.

**Exception — Railways (`railc`) Make list:** the Railways family deliberately
uses the full `getDistinctMakes(rm)` list (default `CORE`) per an explicit user
decision, NOT a curated source list. This is the one place the fragmentation
caveat above is accepted, because Railways supplier tags are single-token and do
not fragment. Treat this as an intentional, user-approved deviation.

**Schemas currently exposed in the calculator UI:** kv-style families (TLT,
Sub-Station, RSJ-BP, etc.), `hwfast` (Fasteners, Foundation Bolts → Type/Make/
Grade, Grade recorded-only), `railc` (RLY-Mast/Portal/SPS/Sp.Masts → Section/
Make/matType), `misc`/manual schemas (RLY-Drop Tubes, RLY-BFBRSJ → manual RM
price input). Grade/hwType/section/manualRM are recorded-only and never feed the
cost math.

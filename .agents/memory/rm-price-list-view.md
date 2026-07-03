---
name: RM Price List read-only view
description: Where the RM source sheet's supplier/section header rows (Base Price, Load+Transport+Brokerage) live and how to read them without touching the cost engine.
---

The v6 "RM Price List" worksheet embeds two extra header rows above each block's
Make/Supplier rows: `makeRow - 2` = Base Price, `makeRow - 1` = Load+Transport+
Brokerage (labelled "Transportation:" for Plate/Pipe/Hardware/Foundation Bolts
instead). `buildRMData()`'s `readBlock()` never reads these two rows — it only
needs Make/Supplier/section prices for the cost build-up.

**Why a separate reader function:** any read-only display of the full sheet
(base price + transport breakdown per supplier) needs those two extra rows,
but extending/branching `readBlock()` itself risked touching the calculation
path. A new function reusing the same `makeEvaluator`/overrides plumbing keeps
the display 100% additive with zero risk to `buildRMData`/`calculateCostSheet`.

**How to apply:** for any future "show the raw sheet" feature, add a sibling
read function next to `buildRMData` in `engine.ts` rather than modifying
`readBlock`'s signature — same pattern as `buildRMPriceListView`.

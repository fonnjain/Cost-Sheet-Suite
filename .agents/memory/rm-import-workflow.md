---
name: RM Price Import Workflow
description: How to regenerate data.ts and update the DB when a new RM Excel workbook is received.
---

## The Rule
RM prices live in TWO places that must both be updated: (1) `artifacts/cost-sheet/src/lib/v6/data.ts` (BILLET_FULL / RM_FULL — the formula evaluator's cell store), and (2) the `rm_prices` DB table (explicit overrides the engine applies on top of BILLET_FULL). Missing either means stale prices.

## Workflow (run in order)

### 1. Regenerate data.ts from the new Excel
```
pnpm --filter @workspace/scripts run gen-data
```
- Reads both "Billet and Gauge" and "RM Price List" worksheets using ExcelJS.
- Replaces BILLET_FULL and RM_FULL in `artifacts/cost-sheet/src/lib/v6/data.ts`.
- Preserves lines 10–12 of data.ts (INITIAL_DATA, MASTER_SPECS, STRUCTURE_FAMILIES) verbatim.
- Prints sanity-check values (Zinc/SAIL_Dgp/Wire/HR Plate) and lists all angle supplier columns.

### 2. Update DB rm_prices
```
pnpm --filter @workspace/scripts run update-rm-prices
```
- Reads current latest row, applies new daily/twice-monthly values on top, inserts a new row.
- API reads latest by `createdAt DESC`, so INSERT is the correct pattern (not UPDATE).
- **Run exactly once** — running again inserts a harmless duplicate; clean up with `cleanup-rm-prices`.

### 3. Check engine column range for angle block
- Angle suppliers read from cols D:O (old, 12 suppliers) or D:P (Aug-2026 file, 13 suppliers).
- If count changes, update the col array in BOTH:
  - `buildRMData` → `readBlock` for angles (~line 257 of engine.ts)
  - `buildRMPriceListView` → `readDisplayBlock` for angles (~line 340 of engine.ts)

### 4. Check DEFAULT_OFFSETS for wire-rod auto values
- D18 (RINL/JSW Pb) and E18 (RINL/JSW Lk) are NOT stored in rm_prices; engine computes them as `C18 + DEFAULT_OFFSETS["D18/E18"]`.
- Aug-2026 values: D18 offset = 7000, E18 offset = 5500 (was 5500/4000).
- If the spread between Ludhiana and RINL/JSW changes, update `DEFAULT_OFFSETS` in engine.ts.

**Why:** The formula evaluator (engine.ts) handles `=H9+1000`-style formulas at runtime from BILLET_FULL, but hardcoded inputs (Zinc, SAIL_Dgp, HR Plate, Wire Rod) and twice-monthly values are stored as DB overrides. BILLET_FULL is only the fallback if the DB is empty.

## Acceptance checks after import
1. Zinc C6 in DB daily = new value
2. SAIL_Dgp H9 in DB daily = new value; SAIL auto-cols (I9/J9/K9/L9) computed from H9 via engine formulas
3. Wire Rod C18 in DB daily = new value; D18/E18 auto-computed from updated DEFAULT_OFFSETS
4. HR Plate (C12/D12/E12) and HR Coil (D15) in DB twice-monthly = new values
5. Angle supplier cols in RM_FULL: correct names, no legacy suppliers (MAHAMAYA, SREL PG/NTPC)
6. Engine angle col list matches actual supplier count in new Excel

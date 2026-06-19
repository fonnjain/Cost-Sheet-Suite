---
name: v6 cost-sheet reconciliation
description: How new quotes are computed (v6 engine) yet stored in the old shape; parity anchors and scope boundaries.
---

# v6 Cost Sheet Reconciliation

The cost-sheet calculator was reconciled to faithfully port the v6 workbook
(`attached_assets/Vijay_Cost_Sheet_Suite-v6_*.html`). Engine + embedded data live
in `artifacts/cost-sheet/src/lib/v6/{data.ts,engine.ts}`. `data.ts` is
AUTO-GENERATED from the HTML — never hand-edit its cell tables.

## Storage decision (Option B)
New quotes are COMPUTED by the v6 engine but PERSISTED in the legacy flat shape
(flat `costBreakdown` + camelCase `inputs`) via `lib/v6/legacy.ts#toLegacyShape`.
**Why:** dashboard/review/pdf read the old shape; keeping storage stable avoids
touching every downstream page. **How to apply:** if you add an engine output
field that a downstream page must show, extend `toLegacyShape` mapping — do not
change the stored schema shape.

## Parity anchors (must hold to the rupee)
With default seeded RM data: Light Angle NPG MS = 46231; TLT >800 mt @33/66kV
NPG MS quote @3% margin = 76939. Verify by bundling the engine with esbuild and
running headless (no tsx in repo; Node can't resolve extensionless TS imports).

## HARD RULE
Never invent labels/options/ratios/values — everything must trace to v6
(`MASTER_SPECS`, `STRUCTURE_FAMILIES`, `INITIAL_DATA`).

## Scope boundary (Phase 1)
Only 7 `tlt5` specs are wired into the calculator picker: TLT (3 bands),
Sub-Station (L) (3 bands), out source < 150. Other families/schemas (rsj, subp,
fasteners, poles, etc.) are NOT yet ported. Legacy quotes are flagged via the
`legacy` boolean column on `quotes` and shown read-only with a badge.

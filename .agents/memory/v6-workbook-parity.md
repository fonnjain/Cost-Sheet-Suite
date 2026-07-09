---
name: v6 workbook parity verification
description: How to verify cost-sheet structures against the v6 workbook targets, and the explicit-zero defaults trap.
---

# Verifying structures against the v6 workbook

**Rule:** The user's "to the rupee" workbook targets correspond to each Excel sheet's *blank-template state*, not the app's pre-filled form defaults: kv unselected (RM price 0), zinc micron blank (0), manual-RM sheets at their stored cell value (usually 0; NTLT-Earthing stored 500). Reproduce that input state through `buildDefaultInputs` + overrides and compare `subtotal`/`total`.

**Why:** The live engine is verbatim-identical to the workbook HTML's JS, so any mismatch is an input-state/wiring difference, never a formula bug. Default form state (kv pre-selected, 50000 manual RM fallback) gives huge numbers that will never match the targets.

**How to apply:** Bundle the engine with esbuild (binary lives under `artifacts/api-server/node_modules/.bin/esbuild`, not the repo root) to a CJS file and drive it from node with INITIAL_DATA-derived RM data.

# Explicit-zero defaults trap

**Rule:** Sheet defaults may carry a *meaningful* explicit 0 (e.g. Buyout `zinc_price: 0` — no galvanizing). Any fallback chain over defaults must use `??`, not `||`, or the 0 gets silently replaced by a live console price.

**Why:** `d.zinc_price || rm.zincPrice || 285000` inflated Buyout by ₹19,220/MT. The workbook HTML has the same `||` bug — the Excel-stored values are the ground truth, not the workbook's form-prefill JS.

**How to apply:** When porting or extending `buildDefaultInputs`-style prefill logic, check which sheets hold explicit zeros (Sub-Station (P), Solar Pump Strs, NTLT-MS Rod Elect., Buyout have `zinc_price: 0`; Fasteners/Foundation Bolts have it undefined and need the fallback).

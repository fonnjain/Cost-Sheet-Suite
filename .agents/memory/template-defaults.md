---
name: Template Defaults Admin Editor
description: How admin-editable per-structure "purple-coded" workbook defaults are stored and applied in the calculator.
---

## The Rule
Admin-editable per-structure defaults are stored in `template_defaults` (unique on `structure_name, field_key`) with history in `template_defaults_history`. DB empty = fall through to hardcoded MASTER_SPECS defaults (zero behaviour change on existing installs).

## How it works
- `GET /template-defaults` — admin only; returns all stored overrides as flat array
- `POST /template-defaults/:structureName` — admin only; upserts all fields for one structure; writes diff to history
- `buildDefaultInputs(spec, rm, dbOverrides?)` — optional third arg is `Record<string, number>` merged into `d = spec.defaults` BEFORE schema-specific processing; this means `zinc_micron` override naturally flows to `zincMicron` via existing mapping
- Calculator fetches `useGetTemplateDefaults()`, builds `structureTemplateOverrides` map filtered by current `structureType`, passes to `buildDefaultInputs`
- Admin page shows Template Defaults accordion (admin-only) grouped by family → structure; each structure editor exposes all spec field groups including credit table + margins

**Why:** DB empty = safe fallback; merged into `d` (not applied after) = all downstream mappings remain correct including zinc_micron.

## Field keys exposed
- Conversion: `fab_labor`, `weld_cons`, `galv_fl`, `pack_strn`, `load_unload`, `handover`, `others_conv`
- Material: `recovery_pct`, `scrap_pct`, `zinc_micron`
- Prototype: `proto_cost`, `proto_pct`
- Finance: `wip_steel_rate`, `wip_steel_months`, `wip_zinc_rate`, `wip_zinc_months`
- Contractual: `inspect_ins`, `sp_packing`, `freight_out`, `third_party`, `agency_comm`, `bg_cost`
- Credit: `{id}_rate`, `{id}_months`, `{id}_pct` for each of 9 credit components
- Margins: `margin_0..3` (stored as fraction in spec, entered as whole % in form, stored as fraction in DB)

**How to apply:** All pct/rate fields are stored as decimals (0.05 = 5%). The editor displays them multiplied by 100 and parses them back divided by 100 before saving.

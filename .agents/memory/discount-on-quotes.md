---
name: Additional Discount on Quotes
description: Post-calculation salesperson discount — mode, storage, and display rules.
---

## The Rule
An optional additional discount can be applied after the margin-based quote price in Step 4. It does NOT change cost or subtotal — it reduces `quotePricePerMt` to produce `netQuotePricePerMt`.

## DB columns on `quotes`
- `discount_mode` text: `'pct'` (fractional, e.g. 0.05 = 5%) or `'abs'` (absolute ₹/MT)
- `discount_value` numeric(12,4): the magnitude (fraction for pct, ₹ for abs)
- `net_quote_price_per_mt` numeric(12,2): pre-computed at save time

`quotePricePerMt` is always the pre-discount price. NULL discount columns = no discount applied.

## Calculator Step 4 UI
- Toggle button group: % | ₹/MT switches `discountMode` state; clears value on switch
- Input reads in user-visible units (5 for 5%, not 0.05)
- Discount amount computed reactively; shown as `− formatINR(discountAmt)` below quote price
- Net Quote shown in emerald green with its own labeled row
- On save: `discountValue` sent as fractional for pct (÷100), raw for abs; `netQuotePricePerMt` sent as computed value
- Discount state resets on structure or margin change

## Review page
- Discount and Net Price / MT columns shown in revision summary and revision history tables ONLY when at least one quote in the project has a discount (`discountValue != null`)
- Line items table gets two extra rows: `− Discount` and `Net Quote /MT` below the `Quote Price /MT` row, same conditional
- Discount amount reconstructed client-side: `pct → quotePricePerMt × discountValue`; `abs → discountValue`

**Why:** Keeping pre-discount price as canonical allows audit trail; discount is salesperson override, not part of cost model.

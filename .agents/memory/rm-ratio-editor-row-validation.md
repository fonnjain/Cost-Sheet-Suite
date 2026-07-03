---
name: RM ratio editor row-sum validation
description: Partial-payload bypass risk for any "row must sum to 100%" admin-editable table API.
---

When an API validates that a set of values sums to some target (e.g. row-sum-to-100% for admin-editable ratio/percentage tables), never validate only the submitted keys. A caller can send a partial payload (subset of categories) that itself sums correctly while leaving other existing categories in the DB untouched, silently pushing the stored row's true total off the target.

**Why:** Found via architect code review of the RM ratio editor (`rm-ratios.ts`) — the original implementation summed only `Object.entries(req.body.ratios)`, so a request with one category = 100% passed validation even though the row had 4 other categories in the DB, leaving the persisted row far from 100%.

**How to apply:** Require the request to supply the *exact* existing key set for the row (reject on missing or unknown keys) before checking the sum, and wrap the multi-row upsert + history-log insert in a single DB transaction so partial writes can't leave inconsistent state on error.

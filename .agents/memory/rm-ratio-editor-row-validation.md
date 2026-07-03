---
name: RM ratio editor row-sum validation
description: Partial-payload bypass risk for any "row must sum to 100%" admin-editable table API.
---

When an API validates that a set of values sums to some target (e.g. row-sum-to-100% for admin-editable ratio/percentage tables), never validate only the submitted keys. A caller can send a partial payload (subset of categories) that itself sums correctly while leaving other existing categories in the DB untouched, silently pushing the stored row's true total off the target.

**Why:** Found via architect code review of the RM ratio editor (`rm-ratios.ts`) — the original implementation summed only `Object.entries(req.body.ratios)`, so a request with one category = 100% passed validation even though the row had 4 other categories in the DB, leaving the persisted row far from 100%.

**How to apply:** Require the request to supply the *exact* existing key set for the row (reject on missing or unknown keys) before checking the sum, and wrap the multi-row upsert + history-log insert in a single DB transaction so partial writes can't leave inconsistent state on error.

## Editor grid must fall back to client-side defaults, not the DB

An admin editor for an override table must build its canonical grid (which rows/columns exist and their default values) from the same client-side defaults the app already falls back to (here `MASTER_SPECS.ratios.kv_options`), then overlay DB rows on top. Do NOT render the grid purely from DB rows.

**Why:** The editor originally rendered rows only from `GET /rm-ratios`. It worked in dev (seed script had run) but showed "No ratio rows found" in production, because the production database was seeded before this table existed and Replit's publish flow only migrates *schema*, not *data* — so `rm_ratios` was empty in prod. Quotes still computed fine (the calculator already fell back to `MASTER_SPECS`), which masked the problem; only the editor broke.

**How to apply:** Any admin UI over a "DB-is-a-sparse-override-of-hardcoded-defaults" table should source its grid from the defaults and treat DB rows as an overlay, so it works on a fresh/unseeded database and the first save persists the row. Don't rely on prod data seeding to make an editor render.

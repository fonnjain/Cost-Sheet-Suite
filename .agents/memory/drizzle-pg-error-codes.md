---
name: Drizzle pg error codes
description: How to detect unique-constraint (23505) violations when using drizzle-orm with node-postgres
---

Rule: when mapping Postgres errors (e.g. unique-constraint 23505 → HTTP 409), check `err.cause.code`, not just `err.code`.

**Why:** drizzle-orm (node-postgres driver) wraps the raw pg error in a "Failed query" error; the SQLSTATE code lives on the wrapped error's `cause`. Checking only `err.code` silently misses the match and the request falls through to a raw 500.

**How to apply:** in catch blocks around drizzle inserts/updates, test both `err.code` and `(err.cause as any)?.code` for the SQLSTATE (`23505` = unique violation). Prefer this DB-level mapping over SELECT-then-INSERT pre-checks alone, which are race-prone.

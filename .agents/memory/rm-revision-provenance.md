---
name: RM revision provenance
description: Durable audit and traceability rules for raw-material price, offset, and quote revisions.
---

RM price records are append-only audit revisions. A saved price revision stores the exact offset revision available at its creation, and quote saves retain the RM price and offset IDs they calculated with. Existing quotes remain intentionally unlinked and must never be recalculated or rewritten.

**Why:** A historical quote needs to identify the dated source values behind it without altering its original numbers. Deriving prior offsets from the current value or deleting older price rows makes that traceability unreliable.

**How to apply:** Never update or delete an `rm_prices` record; represent window overrides as a new retained revision. When changing RM/offset save behavior, preserve the immutable price-to-offset link and keep quote provenance nullable for legacy records.
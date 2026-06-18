---
name: Quote vendor-approval invariant
description: How "vendor-approved quote" works in the cost-sheet Review page and its single-approved invariant.
---

# Vendor-approved quote (Review page)

A quote can be flagged as the vendor-approved/finalized quote. The invariant: **at most one approved revision per (customerId + projectRef)**.

**Why:** A project's order is finalized against exactly one revision; multiple "approved" rows would be ambiguous.

**How to apply:**
- The approve endpoint must clear approval on all sibling revisions and set the target in a **single DB transaction** — two separate updates can crash mid-way and leave a project with zero approved revisions.
- Frontend: a user's row selection must be validated against the currently loaded project's quotes before approving (quote IDs are globally unique, so a stale selection from a prior project must not be sent). Reset the selection when customer/project changes.
- "Save to Monday.com" on the Review page is intentionally a stub (toast only) — the integration is deferred until configured.

/**
 * cleanup-rm-prices.ts — intentionally non-destructive.
 *
 * RM price revisions are an audit record. Never delete rows from rm_prices:
 * every dated price change must remain available for quote traceability.
 */
console.warn(
  "No RM price history was removed. This command is intentionally a no-op because rm_prices is a permanent audit trail.",
);

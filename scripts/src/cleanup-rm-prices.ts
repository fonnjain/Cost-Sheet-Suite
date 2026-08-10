/**
 * cleanup-rm-prices.ts — removes all but the latest rm_prices row.
 * Safe to run at any time.
 */
import { db } from "@workspace/db";
import { rmPricesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function run() {
  const rows = await db.select().from(rmPricesTable);
  const sorted = rows.sort((a, b) => b.id - a.id);
  if (sorted.length <= 1) {
    console.log(`Only ${sorted.length} row(s), nothing to clean.`);
    process.exit(0);
  }
  const keep = sorted[0];
  console.log(`Keeping row id=${keep.id} (createdByName="${keep.createdByName}")`);
  for (const row of sorted.slice(1)) {
    await db.delete(rmPricesTable).where(eq(rmPricesTable.id, row.id));
    console.log(`Deleted row id=${row.id}`);
  }
  console.log("Done.");
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });

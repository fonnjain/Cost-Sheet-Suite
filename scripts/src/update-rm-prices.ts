/**
 * update-rm-prices.ts — updates the rm_prices table with new values from the
 * August 2026 RM Price & Gauge List update.
 *
 * Run: pnpm --filter @workspace/scripts run update-rm-prices
 */

import { db } from "@workspace/db";
import { rmPricesTable, rmOffsetsTable } from "@workspace/db/schema";

async function run() {
  // ── 1. Read all rm_prices and find the latest by id ─────────────────────
  const allPrices = await db.select().from(rmPricesTable);
  const current = allPrices.sort((a, b) => b.id - a.id)[0];

  if (!current) {
    console.error("No rm_prices row found. Run seed first.");
    process.exit(1);
  }

  const oldDaily = (current.dailyData as Record<string, number>) ?? {};
  const oldTwice = (current.twiceMonthlyData as Record<string, number>) ?? {};

  console.log("Current daily values (relevant):");
  for (const k of ["C6", "H9", "C18", "D18", "E18"])
    console.log(`  ${k}: ${oldDaily[k]}`);
  console.log("Current twice-monthly values:");
  for (const k of ["C12", "D12", "E12", "C15", "D15", "E15"])
    console.log(`  ${k}: ${oldTwice[k]}`);

  // ── 2. Build new overrides ───────────────────────────────────────────────
  // Remove D18/E18 from daily so the engine's updated DEFAULT_OFFSETS
  // (now 7000/5500) drive them from C18=54,000 automatically.
  const { D18: _d18, E18: _e18, ...dailyWithoutAuto } = oldDaily;
  void _d18; void _e18;

  const newDaily: Record<string, number> = {
    ...dailyWithoutAuto,
    C6: 409500,   // Zinc HZL
    H9: 44500,    // SAIL_Dgp (SAIL_Kol/Ryp/Ngp/Rour auto-compute from H9)
    C18: 54000,   // Wire Rod Ludhiana (RINL/JSW auto from DEFAULT_OFFSETS)
  };

  const newTwice: Record<string, number> = {
    ...oldTwice,
    C12: 57000,   // HR Plate Raipur
    D12: 57000,   // HR Plate Rourkela
    E12: 59000,   // HR Plate Raigarh
    D15: 56075,   // HR Coil Raipur
  };

  console.log("\nNew daily values (relevant):");
  for (const k of ["C6", "H9", "C18"])
    console.log(`  ${k}: ${newDaily[k]}`);
  console.log("New twice-monthly values:");
  for (const k of ["C12", "D12", "E12", "C15", "D15", "E15"])
    console.log(`  ${k}: ${newTwice[k]}`);

  // ── 3. Insert new rm_prices row (API always reads latest by createdAt) ───
  await db.insert(rmPricesTable).values({
    dailyData: newDaily,
    twiceMonthlyData: newTwice,
    createdByName: "System (Aug-2026 price update)",
    isWindowUnlocked: false,
  });
  console.log("\n✓ New rm_prices row inserted.");

  // ── 4. Check rm_offsets for stale D18/E18 entries ───────────────────────
  const allOffsets = await db.select().from(rmOffsetsTable);
  const latestOffsets = allOffsets.sort((a, b) => b.id - a.id)[0];

  if (latestOffsets) {
    const off = (latestOffsets.offsetData as Record<string, number>) ?? {};
    if (off["D18"] !== undefined || off["E18"] !== undefined) {
      console.warn(`\n⚠ rm_offsets has stored D18=${off["D18"]}, E18=${off["E18"]}.`);
      console.warn("  These override DEFAULT_OFFSETS. Inserting updated row (7000/5500)...");
      const newOffsets = { ...off, D18: 7000, E18: 5500 };
      await db.insert(rmOffsetsTable).values({
        offsetData: newOffsets,
        updatedByName: "System (Aug-2026 offset update)",
      });
      console.log("  ✓ rm_offsets updated.");
    } else {
      console.log("\n✓ rm_offsets has no D18/E18 overrides — DEFAULT_OFFSETS (7000/5500) will apply.");
    }
  } else {
    console.log("\n✓ No rm_offsets row — DEFAULT_OFFSETS (7000/5500) will apply.");
  }

  console.log("\nAuto-computed values the engine will produce:");
  const H9 = 44500, C18 = 54000;
  console.log(`  I9  SAIL_Kol    = ${H9} + 1000  = ${H9 + 1000}`);
  console.log(`  J9  SAIL_Ryp    = ${H9} + 2250  = ${H9 + 2250}`);
  console.log(`  K9  SAIL_Ngp    = ${H9} + 2750  = ${H9 + 2750}`);
  console.log(`  L9  SAIL_Rour   = ${H9} + 1450  = ${H9 + 1450}`);
  console.log(`  D18 RINL/JSW Pb = ${C18} + 7000 = ${C18 + 7000}`);
  console.log(`  E18 RINL/JSW Lk = ${C18} + 5500 = ${C18 + 5500}`);

  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });

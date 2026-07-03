import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { rmRatiosTable, rmRatioHistoryTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { SaveRmRatiosBody } from "@workspace/api-zod";

const router = Router();

const RATIO_SUM_TOLERANCE = 0.005;

router.get("/rm-ratios", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(rmRatiosTable);
  res.json(
    rows.map((r) => ({
      structureName: r.structureName,
      kv: r.kv,
      category: r.category,
      ratioValue: r.ratioValue,
      updatedByName: r.updatedByName,
      updatedAt: r.updatedAt?.toISOString(),
    })),
  );
});

router.post("/rm-ratios", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = SaveRmRatiosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { structureName, kv, ratios } = parsed.data;
  const entries = Object.entries(ratios);

  if (entries.length === 0) {
    res.status(400).json({ error: "At least one category ratio is required" });
    return;
  }

  for (const [category, value] of entries) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      res.status(400).json({ error: `Ratio for "${category}" must be between 0% and 100%` });
      return;
    }
  }

  const existingRows = await db
    .select()
    .from(rmRatiosTable)
    .where(and(eq(rmRatiosTable.structureName, structureName), eq(rmRatiosTable.kv, kv)));
  const existingByCategory = new Map(existingRows.map((r) => [r.category, r.ratioValue]));

  // The request must supply the FULL row -- every existing category for this
  // (structureName, kv), and no unknown ones -- otherwise a partial payload
  // could pass the sum-to-100% check while leaving other categories
  // untouched in the DB, silently pushing the stored row's total off 100%.
  if (existingRows.length > 0) {
    const existingCategories = new Set(existingByCategory.keys());
    const submittedCategories = new Set(entries.map(([cat]) => cat));
    const missing = [...existingCategories].filter((c) => !submittedCategories.has(c));
    const unknown = [...submittedCategories].filter((c) => !existingCategories.has(c));
    if (missing.length > 0 || unknown.length > 0) {
      res.status(400).json({
        error: `Request must include exactly the existing categories for ${structureName} / ${kv}` +
          (missing.length > 0 ? `; missing: ${missing.join(", ")}` : "") +
          (unknown.length > 0 ? `; unknown: ${unknown.join(", ")}` : ""),
      });
      return;
    }
  }

  const sum = entries.reduce((acc, [, v]) => acc + v, 0);
  if (Math.abs(sum - 1) > RATIO_SUM_TOLERANCE) {
    res.status(400).json({
      error: `Ratios for ${structureName} / ${kv} must sum to 100% (currently ${(sum * 100).toFixed(1)}%)`,
    });
    return;
  }

  const changedByName = req.userName ?? "Unknown";
  const historyRows: (typeof rmRatioHistoryTable.$inferInsert)[] = [];

  for (const [category, newValue] of entries) {
    const oldValue = existingByCategory.get(category) ?? null;
    if (oldValue === null || Math.abs(oldValue - newValue) > 1e-9) {
      historyRows.push({
        structureName,
        kv,
        category,
        oldValue,
        newValue,
        changedByName,
      });
    }
  }

  await db.transaction(async (tx) => {
    for (const [category, newValue] of entries) {
      await tx
        .insert(rmRatiosTable)
        .values({ structureName, kv, category, ratioValue: newValue, updatedByName: changedByName })
        .onConflictDoUpdate({
          target: [rmRatiosTable.structureName, rmRatiosTable.kv, rmRatiosTable.category],
          set: { ratioValue: newValue, updatedByName: changedByName, updatedAt: new Date() },
        });
    }
    if (historyRows.length > 0) {
      await tx.insert(rmRatioHistoryTable).values(historyRows);
    }
  });

  const saved = await db
    .select()
    .from(rmRatiosTable)
    .where(and(eq(rmRatiosTable.structureName, structureName), eq(rmRatiosTable.kv, kv)));

  res.json(
    saved.map((r) => ({
      structureName: r.structureName,
      kv: r.kv,
      category: r.category,
      ratioValue: r.ratioValue,
      updatedByName: r.updatedByName,
      updatedAt: r.updatedAt?.toISOString(),
    })),
  );
});

router.get("/rm-ratios/history", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(rmRatioHistoryTable)
    .orderBy(desc(rmRatioHistoryTable.changedAt))
    .limit(100);

  res.json(
    rows.map((r) => ({
      structureName: r.structureName,
      kv: r.kv,
      category: r.category,
      oldValue: r.oldValue,
      newValue: r.newValue,
      changedByName: r.changedByName,
      changedAt: r.changedAt?.toISOString(),
    })),
  );
});

export default router;

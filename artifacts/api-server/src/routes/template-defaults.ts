import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { templateDefaultsTable, templateDefaultsHistoryTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

// GET /template-defaults — admin only; returns every stored override as a flat array
router.get("/template-defaults", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(templateDefaultsTable);
  res.json(
    rows.map((r) => ({
      structureName: r.structureName,
      fieldKey: r.fieldKey,
      fieldValue: r.fieldValue,
      updatedByName: r.updatedByName,
      updatedAt: r.updatedAt?.toISOString(),
    })),
  );
});

// GET /template-defaults/history — admin only; most recent changes first
router.get("/template-defaults/history", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(templateDefaultsHistoryTable)
    .orderBy(desc(templateDefaultsHistoryTable.changedAt))
    .limit(200);
  res.json(
    rows.map((r) => ({
      structureName: r.structureName,
      fieldKey: r.fieldKey,
      oldValue: r.oldValue ?? null,
      newValue: r.newValue,
      changedByName: r.changedByName,
      changedAt: r.changedAt?.toISOString(),
    })),
  );
});

// POST /template-defaults/:structureName — admin only; upsert-all-fields for one structure
router.post(
  "/template-defaults/:structureName",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const rawParam = Array.isArray(req.params.structureName) ? req.params.structureName[0] : req.params.structureName;
    const structureName = decodeURIComponent(rawParam);
    const { fields } = req.body as { fields?: unknown };

    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      res.status(400).json({ error: "Body must include a 'fields' object mapping field keys to numbers" });
      return;
    }

    const entries = Object.entries(fields as Record<string, unknown>);
    if (entries.length === 0) {
      res.status(400).json({ error: "At least one field is required" });
      return;
    }

    for (const [key, val] of entries) {
      if (typeof val !== "number" || !Number.isFinite(val)) {
        res.status(400).json({ error: `Value for field "${key}" must be a finite number` });
        return;
      }
    }

    const changedByName = req.userName ?? "Unknown";

    // Load current values for this structure to compute change log
    const existingRows = await db
      .select()
      .from(templateDefaultsTable)
      .where(eq(templateDefaultsTable.structureName, structureName));
    const existingByKey = new Map(existingRows.map((r) => [r.fieldKey, r.fieldValue]));

    const historyRows: (typeof templateDefaultsHistoryTable.$inferInsert)[] = [];
    for (const [fieldKey, newVal] of entries) {
      const newValue = newVal as number;
      const oldValue = existingByKey.get(fieldKey) ?? null;
      const changed = oldValue === null || Math.abs(oldValue - newValue) > 1e-9;
      if (changed) {
        historyRows.push({ structureName, fieldKey, oldValue, newValue, changedByName });
      }
    }

    await db.transaction(async (tx) => {
      for (const [fieldKey, val] of entries) {
        const fieldValue = val as number;
        await tx
          .insert(templateDefaultsTable)
          .values({ structureName, fieldKey, fieldValue, updatedByName: changedByName })
          .onConflictDoUpdate({
            target: [templateDefaultsTable.structureName, templateDefaultsTable.fieldKey],
            set: { fieldValue, updatedByName: changedByName, updatedAt: new Date() },
          });
      }
      if (historyRows.length > 0) {
        await tx.insert(templateDefaultsHistoryTable).values(historyRows);
      }
    });

    const saved = await db
      .select()
      .from(templateDefaultsTable)
      .where(eq(templateDefaultsTable.structureName, structureName));

    res.json(
      saved.map((r) => ({
        structureName: r.structureName,
        fieldKey: r.fieldKey,
        fieldValue: r.fieldValue,
        updatedByName: r.updatedByName,
        updatedAt: r.updatedAt?.toISOString(),
      })),
    );
  },
);

export default router;

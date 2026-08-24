import { Router } from "express";
import { desc, eq, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { rmPricesTable, rmOffsetsTable, rmDailyLocksTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { SaveRmPricesBody, UnlockTwiceMonthlyBody, ToggleDailyLockBody } from "@workspace/api-zod";

const router = Router();

function formatRmOffset(r: typeof rmOffsetsTable.$inferSelect) {
  return {
    id: r.id,
    offsetData: r.offsetData,
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function formatRmPrice(
  r: typeof rmPricesTable.$inferSelect,
  offsetVersion: typeof rmOffsetsTable.$inferSelect | undefined,
) {
  return {
    id: r.id,
    dailyData: r.dailyData,
    twiceMonthlyData: r.twiceMonthlyData,
    createdByName: r.createdByName,
    isWindowUnlocked: r.isWindowUnlocked,
    isWindowOverride: r.isWindowUnlocked,
    createdAt: r.createdAt?.toISOString(),
    offsetVersion: offsetVersion ? formatRmOffset(offsetVersion) : null,
  };
}

function isTwiceMonthlyWindow(): boolean {
  const day = new Date().getDate();
  return day === 1 || day === 16;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// RM prices auto-lock every day at 2:00 PM (server local time). Before then they
// are open by default; an admin can still lock early or unlock for the rest of
// the day. The admin override only counts when it was set today, so the 2:00 PM
// auto-lock resets every day on its own.
const AUTO_LOCK_HOUR = 14;

function isAfterAutoLockTime(): boolean {
  return new Date().getHours() >= AUTO_LOCK_HOUR;
}

async function isDailyLockedToday(): Promise<boolean> {
  const [latest] = await db
    .select()
    .from(rmDailyLocksTable)
    .orderBy(desc(rmDailyLocksTable.createdAt))
    .limit(1);
  // An explicit admin lock/unlock set today wins over the schedule.
  if (latest && latest.lockedDate === todayKey()) {
    return latest.locked;
  }
  // Otherwise fall back to the daily 2:00 PM auto-lock.
  return isAfterAutoLockTime();
}

async function getLatestOffset(): Promise<typeof rmOffsetsTable.$inferSelect | undefined> {
  const [latest] = await db
    .select()
    .from(rmOffsetsTable)
    .orderBy(desc(rmOffsetsTable.updatedAt))
    .limit(1);
  return latest;
}

async function getApplicableOffset(createdAt: Date): Promise<typeof rmOffsetsTable.$inferSelect | undefined> {
  const [offset] = await db
    .select()
    .from(rmOffsetsTable)
    .where(lte(rmOffsetsTable.updatedAt, createdAt))
    .orderBy(desc(rmOffsetsTable.updatedAt), desc(rmOffsetsTable.id))
    .limit(1);
  return offset;
}

async function getOffsetForPrice(price: typeof rmPricesTable.$inferSelect) {
  if (price.rmOffsetsId != null) {
    const [offset] = await db.select().from(rmOffsetsTable).where(eq(rmOffsetsTable.id, price.rmOffsetsId)).limit(1);
    return offset;
  }
  // Legacy price revisions predate the immutable offset link. Resolve their
  // historical offset once by timestamp; all new revisions store the exact ID.
  return getApplicableOffset(price.createdAt);
}

router.get("/rm-prices", requireAuth, async (_req, res): Promise<void> => {
  const [latest] = await db.select().from(rmPricesTable).orderBy(desc(rmPricesTable.createdAt), desc(rmPricesTable.id)).limit(1);
  const latestOffset = latest ? await getOffsetForPrice(latest) : await getLatestOffset();

  const dailyLocked = await isDailyLockedToday();

  if (!latest) {
    res.json({
      id: 0,
      dailyData: {},
      twiceMonthlyData: {},
      offsetData: (latestOffset?.offsetData as Record<string, number>) ?? {},
      createdByName: "System",
      isWindowUnlocked: isTwiceMonthlyWindow(),
      isWindowOverride: false,
      isDailyLocked: dailyLocked,
      createdAt: new Date().toISOString(),
      offsetVersion: latestOffset ? formatRmOffset(latestOffset) : null,
    });
    return;
  }

  res.json({
    ...formatRmPrice(latest, latestOffset),
    offsetData: (latestOffset?.offsetData as Record<string, number>) ?? {},
    isWindowUnlocked: isTwiceMonthlyWindow() || latest.isWindowUnlocked,
    isWindowOverride: latest.isWindowUnlocked,
    isDailyLocked: dailyLocked,
  });
});

router.post("/rm-prices", requireAuth, async (req, res): Promise<void> => {
  const parsed = SaveRmPricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (await isDailyLockedToday()) {
    res.status(403).json({ error: "RM file inputs are locked for today. Try again tomorrow or ask an admin to unlock." });
    return;
  }

  const [[previous], latestOffset] = await Promise.all([
    db.select().from(rmPricesTable).orderBy(desc(rmPricesTable.createdAt), desc(rmPricesTable.id)).limit(1),
    getLatestOffset(),
  ]);
  const isUnlocked = isTwiceMonthlyWindow() || previous?.isWindowUnlocked === true;

  const [saved] = await db
    .insert(rmPricesTable)
    .values({
      dailyData: parsed.data.dailyData,
      twiceMonthlyData: parsed.data.twiceMonthlyData,
      createdByName: req.userName ?? "Unknown",
      rmOffsetsId: latestOffset?.id ?? null,
      isWindowUnlocked: isUnlocked,
    })
    .returning();

  res.status(201).json(formatRmPrice(saved, latestOffset));
});

router.get("/rm-prices/history", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const history = await db
    .select()
    .from(rmPricesTable)
    .orderBy(desc(rmPricesTable.createdAt), desc(rmPricesTable.id));

  const historyWithOffsets = await Promise.all(
    history.map(async (price) => formatRmPrice(price, await getOffsetForPrice(price))),
  );
  res.json(historyWithOffsets);
});

router.post("/rm-prices/unlock-twice-monthly", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UnlockTwiceMonthlyBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const unlocked = parsed.data.unlocked ?? true;

  const [latest] = await db
    .select()
    .from(rmPricesTable)
    .orderBy(desc(rmPricesTable.createdAt))
    .limit(1);

  if (latest && latest.isWindowUnlocked !== unlocked) {
    await db.insert(rmPricesTable).values({
      dailyData: latest.dailyData,
      twiceMonthlyData: latest.twiceMonthlyData,
      createdByName: `${req.userName ?? "Unknown"} (window override)`,
      rmOffsetsId: latest.rmOffsetsId,
      isWindowUnlocked: unlocked,
    });
  }

  res.json({
    success: true,
    message: unlocked ? "Twice-monthly window unlocked" : "Twice-monthly window locked",
  });
});

router.post("/rm-prices/toggle-daily-lock", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = ToggleDailyLockBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  await db.insert(rmDailyLocksTable).values({
    lockedDate: todayKey(),
    locked: parsed.data.locked,
    lockedByName: req.userName ?? "Unknown",
  });

  res.json({
    success: true,
    message: parsed.data.locked ? "RM file inputs locked for today" : "RM file inputs unlocked",
  });
});

export default router;

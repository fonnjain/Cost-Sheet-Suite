import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { rmPricesTable, rmOffsetsTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { SaveRmPricesBody, UnlockTwiceMonthlyBody } from "@workspace/api-zod";

const router = Router();

function formatRmPrice(r: typeof rmPricesTable.$inferSelect) {
  return {
    id: r.id,
    dailyData: r.dailyData,
    twiceMonthlyData: r.twiceMonthlyData,
    createdByName: r.createdByName,
    isWindowUnlocked: r.isWindowUnlocked,
    isWindowOverride: r.isWindowUnlocked,
    createdAt: r.createdAt?.toISOString(),
  };
}

function isTwiceMonthlyWindow(): boolean {
  const day = new Date().getDate();
  return day === 1 || day === 16;
}

async function getLatestOffsetData(): Promise<Record<string, number>> {
  const [latest] = await db
    .select()
    .from(rmOffsetsTable)
    .orderBy(desc(rmOffsetsTable.updatedAt))
    .limit(1);
  return (latest?.offsetData as Record<string, number>) ?? {};
}

router.get("/rm-prices", requireAuth, async (_req, res): Promise<void> => {
  const [[latest], offsetData] = await Promise.all([
    db.select().from(rmPricesTable).orderBy(desc(rmPricesTable.createdAt)).limit(1),
    getLatestOffsetData(),
  ]);

  if (!latest) {
    res.json({
      id: 0,
      dailyData: {},
      twiceMonthlyData: {},
      offsetData,
      createdByName: "System",
      isWindowUnlocked: isTwiceMonthlyWindow(),
      isWindowOverride: false,
      createdAt: new Date().toISOString(),
    });
    return;
  }

  res.json({
    ...formatRmPrice(latest),
    offsetData,
    isWindowUnlocked: isTwiceMonthlyWindow() || latest.isWindowUnlocked,
    isWindowOverride: latest.isWindowUnlocked,
  });
});

router.post("/rm-prices", requireAuth, async (req, res): Promise<void> => {
  const parsed = SaveRmPricesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const isUnlocked = isTwiceMonthlyWindow();

  const [saved] = await db
    .insert(rmPricesTable)
    .values({
      dailyData: parsed.data.dailyData,
      twiceMonthlyData: parsed.data.twiceMonthlyData,
      createdByName: req.userName ?? "Unknown",
      isWindowUnlocked: isUnlocked,
    })
    .returning();

  res.status(201).json(formatRmPrice(saved));
});

router.get("/rm-prices/history", requireAuth, async (_req, res): Promise<void> => {
  const history = await db
    .select()
    .from(rmPricesTable)
    .orderBy(desc(rmPricesTable.createdAt))
    .limit(30);

  res.json(history.map(formatRmPrice));
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

  if (latest) {
    await db
      .update(rmPricesTable)
      .set({ isWindowUnlocked: unlocked })
      .where(eq(rmPricesTable.id, latest.id));
  }

  res.json({
    success: true,
    message: unlocked ? "Twice-monthly window unlocked" : "Twice-monthly window locked",
  });
});

export default router;

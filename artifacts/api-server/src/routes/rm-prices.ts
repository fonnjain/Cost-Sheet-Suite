import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { rmPricesTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { SaveRmPricesBody } from "@workspace/api-zod";

const router = Router();

function formatRmPrice(r: typeof rmPricesTable.$inferSelect) {
  return {
    id: r.id,
    dailyData: r.dailyData,
    twiceMonthlyData: r.twiceMonthlyData,
    createdByName: r.createdByName,
    isWindowUnlocked: r.isWindowUnlocked,
    createdAt: r.createdAt?.toISOString(),
  };
}

function isTwiceMonthlyWindow(): boolean {
  const day = new Date().getDate();
  return day === 1 || day === 15;
}

router.get("/rm-prices", requireAuth, async (_req, res): Promise<void> => {
  const [latest] = await db
    .select()
    .from(rmPricesTable)
    .orderBy(desc(rmPricesTable.createdAt))
    .limit(1);

  if (!latest) {
    res.json({
      id: 0,
      dailyData: {},
      twiceMonthlyData: {},
      createdByName: "System",
      isWindowUnlocked: isTwiceMonthlyWindow(),
      createdAt: new Date().toISOString(),
    });
    return;
  }

  res.json({
    ...formatRmPrice(latest),
    isWindowUnlocked: isTwiceMonthlyWindow() || latest.isWindowUnlocked,
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

router.post("/rm-prices/unlock-twice-monthly", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [latest] = await db
    .select()
    .from(rmPricesTable)
    .orderBy(desc(rmPricesTable.createdAt))
    .limit(1);

  if (latest) {
    await db
      .update(rmPricesTable)
      .set({ isWindowUnlocked: true })
      .where(eq(rmPricesTable.id, latest.id));
  }

  res.json({ success: true, message: "Twice-monthly window unlocked" });
});

export default router;

import { Router } from "express";
import { desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { rmOffsetsTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";
import { SaveRmOffsetsBody } from "@workspace/api-zod";

const router = Router();

router.get("/rm-offsets", requireAuth, async (_req, res): Promise<void> => {
  const [latest] = await db
    .select()
    .from(rmOffsetsTable)
    .orderBy(desc(rmOffsetsTable.updatedAt))
    .limit(1);

  res.json({ offsetData: (latest?.offsetData as Record<string, number>) ?? {} });
});

router.post("/rm-offsets", requireAuth, async (req, res): Promise<void> => {
  const parsed = SaveRmOffsetsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [saved] = await db
    .insert(rmOffsetsTable)
    .values({
      offsetData: parsed.data.offsetData,
      updatedByName: req.userName ?? "Unknown",
    })
    .returning();

  res.status(201).json({ offsetData: saved.offsetData });
});

export default router;

import { Router } from "express";
import { desc, sql, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { quotesTable, customersTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (_req, res): Promise<void> => {
  const [totalQuotes] = await db.select({ count: count() }).from(quotesTable);

  const [totalCustomers] = await db.select({ count: count() }).from(customersTable);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [quotesThisMonth] = await db
    .select({ count: count() })
    .from(quotesTable)
    .where(sql`${quotesTable.createdAt} >= ${startOfMonth}`);

  const [avgResult] = await db
    .select({ avg: sql<number>`COALESCE(AVG(${quotesTable.quotePricePerMt}), 0)` })
    .from(quotesTable);

  const [revisions] = await db
    .select({ total: sql<number>`COALESCE(SUM(${quotesTable.revision}), 0)` })
    .from(quotesTable);

  const [topCustomerResult] = await db
    .select({
      customerName: quotesTable.customerName,
      count: count(),
    })
    .from(quotesTable)
    .groupBy(quotesTable.customerName)
    .orderBy(desc(count()))
    .limit(1);

  res.json({
    totalQuotes: totalQuotes.count,
    totalCustomers: totalCustomers.count,
    quotesThisMonth: quotesThisMonth.count,
    avgQuotePrice: Math.round(avgResult.avg ?? 0),
    totalRevisions: Number(revisions.total ?? 0),
    topCustomer: topCustomerResult?.customerName ?? null,
  });
});

router.get("/dashboard/recent-quotes", requireAuth, async (_req, res): Promise<void> => {
  const quotes = await db
    .select()
    .from(quotesTable)
    .orderBy(desc(quotesTable.createdAt))
    .limit(10);

  res.json(
    quotes.map((q) => ({
      id: q.id,
      customerId: q.customerId,
      customerName: q.customerName,
      projectRef: q.projectRef,
      revision: q.revision,
      structureType: q.structureType,
      kvOption: q.kvOption ?? null,
      quotePricePerMt: Number(q.quotePricePerMt),
      totalCost: Number(q.totalCost),
      steelPrice: q.steelPrice != null ? Number(q.steelPrice) : null,
      zincPrice: q.zincPrice != null ? Number(q.zincPrice) : null,
      inputs: q.inputs,
      costBreakdown: q.costBreakdown,
      generatedByName: q.generatedByName,
      notes: q.notes ?? null,
      createdAt: q.createdAt?.toISOString(),
    }))
  );
});

router.get("/dashboard/quotes-by-structure", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      structureType: quotesTable.structureType,
      count: count(),
    })
    .from(quotesTable)
    .groupBy(quotesTable.structureType)
    .orderBy(desc(count()));

  res.json(rows.map((r) => ({ structureType: r.structureType, count: r.count })));
});

router.get("/dashboard/quotes-by-user", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userName: quotesTable.generatedByName,
      count: count(),
    })
    .from(quotesTable)
    .groupBy(quotesTable.generatedByName)
    .orderBy(desc(count()));

  res.json(rows.map((r) => ({ userName: r.userName, count: r.count })));
});

export default router;

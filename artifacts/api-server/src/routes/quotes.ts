import { Router } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { quotesTable, rmOffsetsTable, rmPricesTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";
import { recordRequestAuditEvent } from "../lib/usage-audit";
import { logger } from "../lib/logger";
import {
  CreateQuoteBody,
  GetQuoteParams,
  ApproveQuoteParams,
  ListQuotesQueryParams,
  GetQuotesByProjectQueryParams,
  GetProjectsByCustomerQueryParams,
} from "@workspace/api-zod";

const router = Router();

type QuoteSources = {
  rmPrice?: typeof rmPricesTable.$inferSelect;
  rmOffset?: typeof rmOffsetsTable.$inferSelect;
};

function formatQuote(q: typeof quotesTable.$inferSelect, sources: QuoteSources = {}) {
  return {
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
    rmPricesId: q.rmPricesId ?? null,
    rmOffsetsId: q.rmOffsetsId ?? null,
    rmPriceSource: sources.rmPrice
      ? {
          id: sources.rmPrice.id,
          createdAt: sources.rmPrice.createdAt.toISOString(),
          createdByName: sources.rmPrice.createdByName,
        }
      : null,
    rmOffsetSource: sources.rmOffset
      ? {
          id: sources.rmOffset.id,
          updatedAt: sources.rmOffset.updatedAt.toISOString(),
          updatedByName: sources.rmOffset.updatedByName,
        }
      : null,
    inputs: q.inputs,
    costBreakdown: q.costBreakdown,
    generatedByName: q.generatedByName,
    notes: q.notes ?? null,
    approved: q.approved,
    approvedAt: q.approvedAt?.toISOString() ?? null,
    approvedByName: q.approvedByName ?? null,
    legacy: q.legacy,
    discountMode: q.discountMode ?? null,
    discountValue: q.discountValue != null ? Number(q.discountValue) : null,
    netQuotePricePerMt: q.netQuotePricePerMt != null ? Number(q.netQuotePricePerMt) : null,
    createdAt: q.createdAt?.toISOString(),
  };
}

async function formatQuotes(quotes: (typeof quotesTable.$inferSelect)[]) {
  const rmPriceIds = [...new Set(quotes.flatMap((q) => q.rmPricesId == null ? [] : [q.rmPricesId]))];
  const rmOffsetIds = [...new Set(quotes.flatMap((q) => q.rmOffsetsId == null ? [] : [q.rmOffsetsId]))];
  const [priceRows, offsetRows] = await Promise.all([
    rmPriceIds.length > 0
      ? db.select().from(rmPricesTable).where(inArray(rmPricesTable.id, rmPriceIds))
      : Promise.resolve([] as (typeof rmPricesTable.$inferSelect)[]),
    rmOffsetIds.length > 0
      ? db.select().from(rmOffsetsTable).where(inArray(rmOffsetsTable.id, rmOffsetIds))
      : Promise.resolve([] as (typeof rmOffsetsTable.$inferSelect)[]),
  ]);
  const priceById = new Map(priceRows.map((row) => [row.id, row]));
  const offsetById = new Map(offsetRows.map((row) => [row.id, row]));
  return quotes.map((quote) => formatQuote(quote, {
    rmPrice: quote.rmPricesId == null ? undefined : priceById.get(quote.rmPricesId),
    rmOffset: quote.rmOffsetsId == null ? undefined : offsetById.get(quote.rmOffsetsId),
  }));
}

async function findQuoteSources(
  rmPricesId: number | null | undefined,
  rmOffsetsId: number | null | undefined,
) {
  const [[rmPrice], [rmOffset]] = await Promise.all([
    rmPricesId == null
      ? Promise.resolve([] as (typeof rmPricesTable.$inferSelect)[])
      : db.select().from(rmPricesTable).where(eq(rmPricesTable.id, rmPricesId)).limit(1),
    rmOffsetsId == null
      ? Promise.resolve([] as (typeof rmOffsetsTable.$inferSelect)[])
      : db.select().from(rmOffsetsTable).where(eq(rmOffsetsTable.id, rmOffsetsId)).limit(1),
  ]);
  return { rmPrice, rmOffset };
}

router.get("/quotes", requireAuth, async (req, res): Promise<void> => {
  const params = ListQuotesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  let query = db.select().from(quotesTable).$dynamic();
  if (params.data.customerId) {
    query = query.where(eq(quotesTable.customerId, params.data.customerId));
  }
  if (params.data.projectRef) {
    query = query.where(eq(quotesTable.projectRef, params.data.projectRef));
  }
  query = query.orderBy(desc(quotesTable.createdAt)).limit(params.data.limit ?? 50);

  const quotes = await query;
  res.json(await formatQuotes(quotes));
});

router.post("/quotes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerId, projectRef } = parsed.data;
  const sourceInput = parsed.data as typeof parsed.data & {
    rmPricesId?: number | null;
    rmOffsetsId?: number | null;
  };
  let sources = await findQuoteSources(sourceInput.rmPricesId, sourceInput.rmOffsetsId);
  if (sourceInput.rmPricesId != null && !sources.rmPrice) {
    res.status(400).json({ error: "The selected RM price revision no longer exists." });
    return;
  }
  if (sourceInput.rmOffsetsId != null && !sources.rmOffset) {
    res.status(400).json({ error: "The selected RM offset revision no longer exists." });
    return;
  }
  // New clients send the exact revisions their calculator loaded. Keep older clients
  // traceable too by resolving the latest retained revisions at the save boundary.
  if (sourceInput.rmPricesId === undefined || sourceInput.rmOffsetsId === undefined) {
    const [[latestPrice], [latestOffset]] = await Promise.all([
      sourceInput.rmPricesId === undefined
        ? db.select().from(rmPricesTable).orderBy(desc(rmPricesTable.createdAt), desc(rmPricesTable.id)).limit(1)
        : Promise.resolve([] as (typeof rmPricesTable.$inferSelect)[]),
      sourceInput.rmOffsetsId === undefined
        ? db.select().from(rmOffsetsTable).orderBy(desc(rmOffsetsTable.updatedAt), desc(rmOffsetsTable.id)).limit(1)
        : Promise.resolve([] as (typeof rmOffsetsTable.$inferSelect)[]),
    ]);
    sources = {
      rmPrice: sourceInput.rmPricesId === undefined ? latestPrice : sources.rmPrice,
      rmOffset: sourceInput.rmOffsetsId === undefined ? latestOffset : sources.rmOffset,
    };
  }
  const rmPricesId = sourceInput.rmPricesId === undefined
    ? sources.rmPrice?.id ?? null
    : sourceInput.rmPricesId ?? null;
  const rmOffsetsId = sourceInput.rmOffsetsId === undefined
    ? sources.rmOffset?.id ?? null
    : sourceInput.rmOffsetsId ?? null;

  const existing = await db
    .select({ revision: quotesTable.revision })
    .from(quotesTable)
    .where(and(eq(quotesTable.customerId, customerId), eq(quotesTable.projectRef, projectRef)))
    .orderBy(desc(quotesTable.revision))
    .limit(1);

  const nextRevision = existing.length > 0 ? existing[0].revision + 1 : 0;

  const [quote] = await db
    .insert(quotesTable)
    .values({
      customerId: parsed.data.customerId,
      customerName: parsed.data.customerName,
      projectRef: parsed.data.projectRef,
      structureType: parsed.data.structureType,
      kvOption: parsed.data.kvOption ?? null,
      quotePricePerMt: String(parsed.data.quotePricePerMt),
      totalCost: String(parsed.data.totalCost),
      steelPrice: parsed.data.steelPrice != null ? String(parsed.data.steelPrice) : null,
      zincPrice: parsed.data.zincPrice != null ? String(parsed.data.zincPrice) : null,
      rmPricesId,
      rmOffsetsId,
      inputs: parsed.data.inputs,
      costBreakdown: parsed.data.costBreakdown,
      generatedByName: parsed.data.generatedByName,
      notes: parsed.data.notes ?? null,
      revision: nextRevision,
      discountMode: (parsed.data as Record<string, unknown>).discountMode as string | undefined ?? null,
      discountValue: (parsed.data as Record<string, unknown>).discountValue != null
        ? String((parsed.data as Record<string, unknown>).discountValue)
        : null,
      netQuotePricePerMt: (parsed.data as Record<string, unknown>).netQuotePricePerMt != null
        ? String((parsed.data as Record<string, unknown>).netQuotePricePerMt)
        : null,
    })
    .returning();

  // A completed quote must not look failed just because analytics is unavailable.
  try {
    await recordRequestAuditEvent(req, {
      eventType: "quote_generated",
      entityType: "quote",
      entityId: String(quote.id),
    });
  } catch (err) {
    logger.error({ err, quoteId: quote.id, userId: req.userId }, "Unable to record quote usage audit event");
  }

  res.status(201).json(formatQuote(quote, sources));
});

router.get("/quotes/by-project", requireAuth, async (req, res): Promise<void> => {
  const params = GetQuotesByProjectQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(
      and(
        eq(quotesTable.customerId, params.data.customerId!),
        eq(quotesTable.projectRef, params.data.projectRef!)
      )
    )
    .orderBy(desc(quotesTable.revision));

  res.json(await formatQuotes(quotes));
});

router.post("/quotes/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ApproveQuoteParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [target] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));

  if (!target) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  // Only one revision per (customer + project) can be the vendor-approved quote.
  // Run both updates in a transaction so we never leave the project with no approved revision.
  const approved = await db.transaction(async (tx) => {
    await tx
      .update(quotesTable)
      .set({ approved: false, approvedAt: null, approvedByName: null })
      .where(
        and(
          eq(quotesTable.customerId, target.customerId),
          eq(quotesTable.projectRef, target.projectRef)
        )
      );

    const [row] = await tx
      .update(quotesTable)
      .set({ approved: true, approvedAt: new Date(), approvedByName: req.userName ?? null })
      .where(eq(quotesTable.id, params.data.id))
      .returning();

    return row;
  });

  res.json((await formatQuotes([approved]))[0]);
});

router.get("/quotes/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetQuoteParams.safeParse({ id: raw });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json((await formatQuotes([quote]))[0]);
});

router.get("/review/projects", requireAuth, async (req, res): Promise<void> => {
  const params = GetProjectsByCustomerQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const projects = await db
    .selectDistinct({ projectRef: quotesTable.projectRef })
    .from(quotesTable)
    .where(eq(quotesTable.customerId, params.data.customerId!))
    .orderBy(quotesTable.projectRef);

  res.json(projects.map((p) => p.projectRef));
});

export default router;

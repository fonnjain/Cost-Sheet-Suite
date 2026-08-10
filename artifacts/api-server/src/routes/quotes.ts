import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { quotesTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";
import {
  CreateQuoteBody,
  GetQuoteParams,
  ApproveQuoteParams,
  ListQuotesQueryParams,
  GetQuotesByProjectQueryParams,
  GetProjectsByCustomerQueryParams,
} from "@workspace/api-zod";

const router = Router();

function formatQuote(q: typeof quotesTable.$inferSelect) {
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
  res.json(quotes.map(formatQuote));
});

router.post("/quotes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { customerId, projectRef } = parsed.data;

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

  res.status(201).json(formatQuote(quote));
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

  res.json(quotes.map(formatQuote));
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

  res.json(formatQuote(approved));
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

  res.json(formatQuote(quote));
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

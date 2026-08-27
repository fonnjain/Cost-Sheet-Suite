import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { quotesTable, usageSessionsTable, userAuditEventsTable, usersTable } from "@workspace/db/schema";
import {
  GetUserUsageQueryParams,
  GetUserUsageResponse,
  RecordUsageEventBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { closeTimedOutUsageSessions, recordHeartbeat, recordRequestAuditEvent } from "../lib/usage-audit";

const router = Router();

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateRange(from?: string, to?: string) {
  const today = new Date();
  const defaultTo = dateString(today);
  const defaultFrom = dateString(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));
  const fromDate = from ?? defaultFrom;
  const toDate = to ?? defaultTo;
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T23:59:59.999Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }
  return { from: fromDate, to: toDate, start, end };
}

router.post("/usage/events", requireAuth, async (req, res): Promise<void> => {
  const parsed = RecordUsageEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  if (input.pagePath != null && (!input.pagePath.startsWith("/") || input.pagePath.includes("?") || input.pagePath.includes("#"))) {
    res.status(400).json({ error: "Page path must be an application route without query parameters." });
    return;
  }

  if (input.eventType === "heartbeat") {
    if (input.activityState !== "active" && input.activityState !== "idle") {
      res.status(400).json({ error: "Heartbeat events require an activity state." });
      return;
    }
    await recordHeartbeat(req, input.activityState, input.pagePath);
  } else if (input.eventType === "page_view") {
    if (!input.pagePath) {
      res.status(400).json({ error: "Page view events require a page path." });
      return;
    }
    await recordRequestAuditEvent(req, { eventType: "page_view", pagePath: input.pagePath });
  } else {
    if (input.entityType !== "quote_revision_report" || !input.entityId) {
      res.status(400).json({ error: "Report export events require their report type and reference." });
      return;
    }
    await recordRequestAuditEvent(req, {
      eventType: "report_export",
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata?.revisionCount == null ? {} : { revisionCount: input.metadata.revisionCount },
    });
  }

  res.status(201).json({ success: true });
});

router.get("/users/usage", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetUserUsageQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const range = parseDateRange(parsed.data.from, parsed.data.to);
  if (!range) {
    res.status(400).json({ error: "Enter a valid date range with the start on or before the end." });
    return;
  }
  const requestedUserId = parsed.data.userId;

  await closeTimedOutUsageSessions();
  const [events, sessions, currentUsers] = await Promise.all([
    db.select()
      .from(userAuditEventsTable)
      .where(and(
        requestedUserId == null ? undefined : eq(userAuditEventsTable.userId, requestedUserId),
        gte(userAuditEventsTable.occurredAt, range.start),
        lte(userAuditEventsTable.occurredAt, range.end),
      ))
      .orderBy(desc(userAuditEventsTable.occurredAt)),
    db.select()
      .from(usageSessionsTable)
      .where(and(
        requestedUserId == null ? undefined : eq(usageSessionsTable.userId, requestedUserId),
        gte(usageSessionsTable.startedAt, range.start),
        lte(usageSessionsTable.startedAt, range.end),
      )),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(requestedUserId == null ? undefined : eq(usersTable.id, requestedUserId))
      .orderBy(asc(usersTable.name)),
  ]);
  const identities = new Map(currentUsers.map((user) => [user.id, user]));
  for (const event of events) {
    if (!identities.has(event.userId)) {
      identities.set(event.userId, { id: event.userId, name: event.actorName, email: "Deleted account" });
    }
  }
  for (const session of sessions) {
    if (!identities.has(session.userId)) {
      identities.set(session.userId, { id: session.userId, name: `Deleted user #${session.userId}`, email: "Deleted account" });
    }
  }
  const allUsers = [...identities.values()];

  const quoteIds = [...new Set(events
    .filter((event) => event.eventType === "quote_generated" && event.entityId != null)
    .map((event) => Number(event.entityId))
    .filter(Number.isInteger))];
  const quoteRows = quoteIds.length === 0
    ? []
    : await db.select({ id: quotesTable.id, totalCost: quotesTable.totalCost })
      .from(quotesTable)
      .where(inArray(quotesTable.id, quoteIds));
  const quoteCostById = new Map(quoteRows.map((quote) => [quote.id, Number(quote.totalCost)]));

  type Accumulator = {
    userId: number;
    userName: string;
    email: string;
    sessionIds: Set<number>;
    activeSeconds: number;
    idleSeconds: number;
    lastActiveAt: Date | null;
    quoteIds: Set<number>;
    reportCount: number;
    pageVisits: Map<string, { visits: number; first: Date; last: Date }>;
    recentEvents: typeof events;
  };
  const summaries = new Map<number, Accumulator>(allUsers.map((user) => [user.id, {
    userId: user.id,
    userName: user.name,
    email: user.email,
    sessionIds: new Set<number>(),
    activeSeconds: 0,
    idleSeconds: 0,
    lastActiveAt: null,
    quoteIds: new Set<number>(),
    reportCount: 0,
    pageVisits: new Map(),
    recentEvents: [],
  }]));

  for (const session of sessions) {
    summaries.get(session.userId)?.sessionIds.add(session.id);
  }
  for (const event of events) {
    const summary = summaries.get(event.userId);
    if (!summary) continue;
    if (event.sessionId != null) summary.sessionIds.add(event.sessionId);
    if (!summary.lastActiveAt || event.occurredAt > summary.lastActiveAt) summary.lastActiveAt = event.occurredAt;
    if (event.eventType === "heartbeat") {
      const duration = event.durationSeconds ?? 0;
      if (event.activityState === "active") summary.activeSeconds += duration;
      if (event.activityState === "idle") summary.idleSeconds += duration;
      continue;
    }
    if (event.eventType === "page_view" && event.pagePath) {
      const page = summary.pageVisits.get(event.pagePath);
      if (page) {
        page.visits += 1;
        if (event.occurredAt < page.first) page.first = event.occurredAt;
        if (event.occurredAt > page.last) page.last = event.occurredAt;
      } else {
        summary.pageVisits.set(event.pagePath, { visits: 1, first: event.occurredAt, last: event.occurredAt });
      }
    }
    if (event.eventType === "quote_generated" && event.entityId) {
      const id = Number(event.entityId);
      if (Number.isInteger(id)) summary.quoteIds.add(id);
    }
    if (event.eventType === "report_export") summary.reportCount += 1;
    if (summary.recentEvents.length < 12) summary.recentEvents.push(event);
  }

  const response = {
    from: range.from,
    to: range.to,
    users: [...summaries.values()]
      .map((summary) => ({
        userId: summary.userId,
        userName: summary.userName,
        email: summary.email,
        sessionCount: summary.sessionIds.size,
        activeSeconds: summary.activeSeconds,
        idleSeconds: summary.idleSeconds,
        lastActiveAt: summary.lastActiveAt?.toISOString() ?? null,
        pageVisitCount: [...summary.pageVisits.values()].reduce((total, page) => total + page.visits, 0),
        uniquePageCount: summary.pageVisits.size,
        quoteCount: summary.quoteIds.size,
        totalCostGenerated: [...summary.quoteIds].reduce((total, id) => total + (quoteCostById.get(id) ?? 0), 0),
        reportCount: summary.reportCount,
        pages: [...summary.pageVisits.entries()]
          .map(([path, page]) => ({
            path,
            visits: page.visits,
            firstVisitedAt: page.first.toISOString(),
            lastVisitedAt: page.last.toISOString(),
          }))
          .sort((a, b) => b.visits - a.visits || a.path.localeCompare(b.path)),
        recentEvents: summary.recentEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          pagePath: event.pagePath ?? null,
          activityState: event.activityState ?? null,
          durationSeconds: event.durationSeconds ?? null,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          occurredAt: event.occurredAt.toISOString(),
        })),
      }))
      .sort((a, b) => {
        const activity = (b.activeSeconds + b.idleSeconds) - (a.activeSeconds + a.idleSeconds);
        return activity || b.quoteCount - a.quoteCount || a.userName.localeCompare(b.userName);
      }),
  };

  res.json(GetUserUsageResponse.parse(response));
});

export default router;
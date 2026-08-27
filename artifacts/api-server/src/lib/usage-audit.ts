import { createHash } from "crypto";
import type { Request } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { usageSessionsTable, userAuditEventsTable } from "@workspace/db/schema";

export const IDLE_THRESHOLD_SECONDS = 300;
export const MAX_HEARTBEAT_SECONDS = 120;
export const MIN_HEARTBEAT_SECONDS = 15;
export const SESSION_TIMEOUT_SECONDS = 10 * 60;

export type AuditEventInput = {
  userId: number;
  actorName: string;
  sessionId?: number | null;
  eventType: string;
  pagePath?: string | null;
  activityState?: string | null;
  durationSeconds?: number | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createUsageSession(token: string, userId: number) {
  const [session] = await db
    .insert(usageSessionsTable)
    .values({ tokenHash: hashSessionToken(token), userId })
    .returning();
  return session;
}

export async function findOrCreateUsageSession(token: string, userId: number) {
  const tokenHash = hashSessionToken(token);
  const [existing] = await db
    .select()
    .from(usageSessionsTable)
    .where(eq(usageSessionsTable.tokenHash, tokenHash))
    .limit(1);
  if (existing) return existing;
  try {
    const [created] = await db
      .insert(usageSessionsTable)
      .values({ tokenHash, userId })
      .returning();
    return created;
  } catch {
    // A simultaneous authenticated request may have created the unique row.
    const [raced] = await db
      .select()
      .from(usageSessionsTable)
      .where(eq(usageSessionsTable.tokenHash, tokenHash))
      .limit(1);
    if (!raced) throw new Error("Unable to initialize usage session");
    return raced;
  }
}

export async function recordAuditEvent(input: AuditEventInput) {
  const [event] = await db
    .insert(userAuditEventsTable)
    .values({
      userId: input.userId,
      actorName: input.actorName,
      sessionId: input.sessionId ?? null,
      eventType: input.eventType,
      pagePath: input.pagePath ?? null,
      activityState: input.activityState ?? null,
      durationSeconds: input.durationSeconds ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
      occurredAt: input.occurredAt ?? new Date(),
    })
    .returning();
  return event;
}

export async function recordRequestAuditEvent(req: Request, input: Omit<AuditEventInput, "userId" | "actorName" | "sessionId">) {
  if (req.userId == null) return null;
  return recordAuditEvent({
    ...input,
    userId: req.userId,
    actorName: req.userName ?? "Unknown",
    sessionId: req.usageSessionId ?? null,
  });
}

export async function recordHeartbeat(
  req: Request,
  activityState: "active" | "idle",
  pagePath?: string | null,
) {
  if (req.userId == null || req.usageSessionId == null) return null;
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_HEARTBEAT_SECONDS * 1000);
  // Claim the interval in a single conditional update. Parallel requests cannot
  // consume the same last-seen period because only the first can move it forward.
  const updated = await db.execute<{ duration_seconds: number | string }>(sql`
    WITH eligible AS (
      SELECT
        id,
        LEAST(${MAX_HEARTBEAT_SECONDS}, FLOOR(EXTRACT(EPOCH FROM ${now} - last_seen_at)))::integer AS duration_seconds
      FROM usage_sessions
      WHERE id = ${req.usageSessionId}
        AND ended_at IS NULL
        AND last_seen_at <= ${cutoff}
      FOR UPDATE
    )
    UPDATE usage_sessions AS session
    SET
      last_seen_at = ${now},
      active_seconds = session.active_seconds + CASE WHEN ${activityState} = 'active' THEN eligible.duration_seconds ELSE 0 END,
      idle_seconds = session.idle_seconds + CASE WHEN ${activityState} = 'idle' THEN eligible.duration_seconds ELSE 0 END
    FROM eligible
    WHERE session.id = eligible.id
    RETURNING eligible.duration_seconds
  `);
  const duration = Number(updated.rows[0]?.duration_seconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return recordRequestAuditEvent(req, {
    eventType: "heartbeat",
    pagePath: pagePath ?? null,
    activityState,
    durationSeconds: duration,
  });
}

export async function endUsageSession(sessionId: number) {
  await db
    .update(usageSessionsTable)
    .set({ endedAt: new Date(), lastSeenAt: new Date() })
    .where(and(eq(usageSessionsTable.id, sessionId), isNull(usageSessionsTable.endedAt)));
}

/**
 * Browsers stop sending heartbeats when a tab is closed or loses connectivity.
 * Finalize such sessions at their last observed activity rather than treating
 * them as indefinitely open in the admin audit.
 */
export async function closeTimedOutUsageSessions() {
  const cutoff = new Date(Date.now() - SESSION_TIMEOUT_SECONDS * 1000);
  await db
    .update(usageSessionsTable)
    .set({ endedAt: new Date() })
    .where(and(isNull(usageSessionsTable.endedAt), sql`${usageSessionsTable.lastSeenAt} < ${cutoff}`));
}
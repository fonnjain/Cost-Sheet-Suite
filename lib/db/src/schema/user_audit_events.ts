import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usageSessionsTable } from "./usage_sessions";

export const userAuditEventsTable = pgTable("user_audit_events", {
  id: serial("id").primaryKey(),
  // Intentionally no foreign key: operational history is retained if an account is deleted.
  userId: integer("user_id").notNull(),
  actorName: text("actor_name").notNull().default("Unknown"),
  sessionId: integer("session_id").references(() => usageSessionsTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  pagePath: text("page_path"),
  activityState: text("activity_state"),
  durationSeconds: integer("duration_seconds"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserAuditEvent = typeof userAuditEventsTable.$inferSelect;
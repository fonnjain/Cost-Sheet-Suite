import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const usageSessionsTable = pgTable("usage_sessions", {
  id: serial("id").primaryKey(),
  // Intentionally no foreign key: audit sessions must outlive a deleted account.
  userId: integer("user_id").notNull(),
  // Only a one-way digest is retained; the authentication token itself is never stored here.
  tokenHash: text("token_hash").notNull().unique(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  activeSeconds: integer("active_seconds").notNull().default(0),
  idleSeconds: integer("idle_seconds").notNull().default(0),
});

export type UsageSession = typeof usageSessionsTable.$inferSelect;
import { pgTable, serial, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rmDailyLocksTable = pgTable("rm_daily_locks", {
  id: serial("id").primaryKey(),
  lockedDate: text("locked_date"),
  lockedByName: text("locked_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRmDailyLockSchema = createInsertSchema(rmDailyLocksTable).omit({ id: true, createdAt: true });
export type InsertRmDailyLock = z.infer<typeof insertRmDailyLockSchema>;
export type RmDailyLock = typeof rmDailyLocksTable.$inferSelect;

import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rmRatioHistoryTable = pgTable("rm_ratio_history", {
  id: serial("id").primaryKey(),
  structureName: text("structure_name").notNull(),
  kv: text("kv").notNull(),
  category: text("category").notNull(),
  oldValue: real("old_value"),
  newValue: real("new_value").notNull(),
  changedByName: text("changed_by_name").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRmRatioHistorySchema = createInsertSchema(rmRatioHistoryTable).omit({ id: true, changedAt: true });
export type InsertRmRatioHistory = z.infer<typeof insertRmRatioHistorySchema>;
export type RmRatioHistory = typeof rmRatioHistoryTable.$inferSelect;

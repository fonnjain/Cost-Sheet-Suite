import { pgTable, serial, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rmRatiosTable = pgTable(
  "rm_ratios",
  {
    id: serial("id").primaryKey(),
    structureName: text("structure_name").notNull(),
    kv: text("kv").notNull(),
    category: text("category").notNull(),
    ratioValue: real("ratio_value").notNull(),
    updatedByName: text("updated_by_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("rm_ratios_structure_kv_category_unique").on(t.structureName, t.kv, t.category)],
);

export const insertRmRatioSchema = createInsertSchema(rmRatiosTable).omit({ id: true, updatedAt: true });
export type InsertRmRatio = z.infer<typeof insertRmRatioSchema>;
export type RmRatio = typeof rmRatiosTable.$inferSelect;

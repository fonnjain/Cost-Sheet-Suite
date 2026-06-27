import { pgTable, serial, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rmOffsetsTable = pgTable("rm_offsets", {
  id: serial("id").primaryKey(),
  offsetData: jsonb("offset_data").notNull(),
  updatedByName: text("updated_by_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRmOffsetsSchema = createInsertSchema(rmOffsetsTable).omit({ id: true, updatedAt: true });
export type InsertRmOffsets = z.infer<typeof insertRmOffsetsSchema>;
export type RmOffsets = typeof rmOffsetsTable.$inferSelect;

import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Append-only audit log: every change to a template default field.
export const templateDefaultsHistoryTable = pgTable("template_defaults_history", {
  id: serial("id").primaryKey(),
  structureName: text("structure_name").notNull(),
  fieldKey: text("field_key").notNull(),
  oldValue: real("old_value"),
  newValue: real("new_value").notNull(),
  changedByName: text("changed_by_name").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTemplateDefaultsHistorySchema = createInsertSchema(templateDefaultsHistoryTable).omit({ id: true, changedAt: true });
export type InsertTemplateDefaultsHistory = z.infer<typeof insertTemplateDefaultsHistorySchema>;
export type TemplateDefaultsHistory = typeof templateDefaultsHistoryTable.$inferSelect;

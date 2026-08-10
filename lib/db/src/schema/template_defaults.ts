import { pgTable, serial, text, real, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Admin-editable per-structure template defaults (the "purple fixed" values in the source workbook).
// One row per (structure_name, field_key). Falls back to embedded MASTER_SPECS defaults when absent.
export const templateDefaultsTable = pgTable(
  "template_defaults",
  {
    id: serial("id").primaryKey(),
    structureName: text("structure_name").notNull(),
    fieldKey: text("field_key").notNull(),
    fieldValue: real("field_value").notNull(),
    updatedByName: text("updated_by_name").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("template_defaults_structure_field_unique").on(t.structureName, t.fieldKey)],
);

export const insertTemplateDefaultSchema = createInsertSchema(templateDefaultsTable).omit({ id: true, updatedAt: true });
export type InsertTemplateDefault = z.infer<typeof insertTemplateDefaultSchema>;
export type TemplateDefault = typeof templateDefaultsTable.$inferSelect;

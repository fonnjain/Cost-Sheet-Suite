import { pgTable, serial, integer, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  projectRef: text("project_ref").notNull(),
  revision: integer("revision").notNull().default(0),
  structureType: text("structure_type").notNull(),
  kvOption: text("kv_option"),
  quotePricePerMt: numeric("quote_price_per_mt", { precision: 12, scale: 2 }).notNull(),
  totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
  steelPrice: numeric("steel_price", { precision: 12, scale: 2 }),
  zincPrice: numeric("zinc_price", { precision: 12, scale: 2 }),
  inputs: jsonb("inputs").notNull(),
  costBreakdown: jsonb("cost_breakdown").notNull(),
  generatedByName: text("generated_by_name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

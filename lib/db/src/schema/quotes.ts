import { pgTable, serial, integer, text, numeric, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { rmPricesTable } from "./rm_prices";
import { rmOffsetsTable } from "./rm_offsets";

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
  // The exact persisted RM/offset revisions that supplied this quote's price inputs.
  // Null for historical quotes created before revision traceability was introduced.
  rmPricesId: integer("rm_prices_id").references(() => rmPricesTable.id, { onDelete: "restrict" }),
  rmOffsetsId: integer("rm_offsets_id").references(() => rmOffsetsTable.id, { onDelete: "restrict" }),
  inputs: jsonb("inputs").notNull(),
  costBreakdown: jsonb("cost_breakdown").notNull(),
  generatedByName: text("generated_by_name").notNull(),
  notes: text("notes"),
  approved: boolean("approved").notNull().default(false),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedByName: text("approved_by_name"),
  // Quotes computed by the pre-reconciliation engine are flagged legacy and shown
  // read-only with a "computed on previous logic" note. New quotes default to false.
  legacy: boolean("legacy").notNull().default(false),
  // Additional discount applied by the salesperson after margin (does not change underlying cost).
  // discountMode: 'pct' (fractional, e.g. 0.05 = 5%) or 'abs' (absolute ₹/MT).
  // netQuotePricePerMt = quotePricePerMt minus the discount. NULL when no discount applied.
  discountMode: text("discount_mode"),
  discountValue: numeric("discount_value", { precision: 12, scale: 4 }),
  netQuotePricePerMt: numeric("net_quote_price_per_mt", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

import { pgTable, serial, timestamp, text, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rmPricesTable = pgTable("rm_prices", {
  id: serial("id").primaryKey(),
  dailyData: jsonb("daily_data").notNull(),
  twiceMonthlyData: jsonb("twice_monthly_data").notNull(),
  createdByName: text("created_by_name").notNull(),
  isWindowUnlocked: boolean("is_window_unlocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRmPricesSchema = createInsertSchema(rmPricesTable).omit({ id: true, createdAt: true });
export type InsertRmPrices = z.infer<typeof insertRmPricesSchema>;
export type RmPrices = typeof rmPricesTable.$inferSelect;

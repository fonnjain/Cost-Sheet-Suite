import { Router } from "express";
import { asc } from "drizzle-orm";
import { db } from "@workspace/db";
import { customersTable } from "@workspace/db/schema";
import { requireAuth } from "../middlewares/auth";
import { CreateCustomerBody } from "@workspace/api-zod";

const router = Router();

router.get("/customers", requireAuth, async (_req, res): Promise<void> => {
  const customers = await db
    .select()
    .from(customersTable)
    .orderBy(asc(customersTable.name));

  res.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      createdAt: c.createdAt?.toISOString(),
    }))
  );
});

router.post("/customers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db
    .insert(customersTable)
    .values(parsed.data)
    .returning();

  res.status(201).json({
    id: customer.id,
    name: customer.name,
    createdAt: customer.createdAt?.toISOString(),
  });
});

export default router;

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { usersTable, quotesTable, sessionsTable } from "@workspace/db/schema";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  CreateUserBody,
  UpdateUserBody,
  UpdateUserParams,
  DeleteUserParams,
  ResetUserPasswordParams,
  GetUserActivityResponse,
} from "@workspace/api-zod";

const router = Router();

router.get("/users/activity", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const quotes = await db
    .select({
      id: quotesTable.id,
      customerName: quotesTable.customerName,
      projectRef: quotesTable.projectRef,
      revision: quotesTable.revision,
      structureType: quotesTable.structureType,
      generatedByName: quotesTable.generatedByName,
      createdAt: quotesTable.createdAt,
    })
    .from(quotesTable)
    .orderBy(desc(quotesTable.createdAt));

  const byUser = new Map<string, typeof quotes>();
  for (const q of quotes) {
    const list = byUser.get(q.generatedByName);
    if (list) {
      list.push(q);
    } else {
      byUser.set(q.generatedByName, [q]);
    }
  }

  const activity = Array.from(byUser.entries())
    .map(([userName, userQuotes]) => ({
      userName,
      quoteCount: userQuotes.length,
      quotes: userQuotes.map((q) => ({
        id: q.id,
        customerName: q.customerName,
        projectRef: q.projectRef,
        revision: q.revision,
        structureType: q.structureType,
        createdAt: q.createdAt.toISOString(),
      })),
    }))
    .sort((a, b) => b.quoteCount - a.quoteCount);

  res.json(GetUserActivityResponse.parse(activity));
});

router.get("/users", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .orderBy(usersTable.createdAt);
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt?.toISOString(),
    }))
  );
});

router.post("/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();

  let user;
  try {
    [user] = await db
      .insert(usersTable)
      .values({ ...parsed.data, email })
      .returning();
  } catch (err: unknown) {
    // Unique-constraint violation on email → 409 (DB is the final authority).
    // Drizzle wraps the pg error, so check both the error and its cause.
    const pgCode = (e: unknown): string | undefined =>
      e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    const cause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : undefined;
    if (pgCode(err) === "23505" || pgCode(cause) === "23505") {
      res.status(409).json({ error: "A user with this email already exists." });
      return;
    }
    throw err;
  }

  res.status(201).json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt?.toISOString(),
  });
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt?.toISOString(),
  });
});

router.post("/users/:id/reset-password", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = ResetUserPasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ passwordHash: null, mustChangePassword: true })
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Revoke all sessions so the old password can't keep an active session alive.
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));

  res.json({ success: true });
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({ success: true });
});

export default router;

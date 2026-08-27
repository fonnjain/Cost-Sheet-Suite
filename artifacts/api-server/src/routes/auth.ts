import { Router } from "express";
import { eq, and, ne } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, sessionsTable } from "@workspace/db/schema";
import { LoginBody, ChangePasswordBody, GetMeResponse } from "@workspace/api-zod";
import { requireAuth, extractToken } from "../middlewares/auth";
import { createUsageSession, endUsageSession, recordAuditEvent } from "../lib/usage-audit";
import { logger } from "../lib/logger";

const router = Router();

// Default password assigned to every user until they set their own.
const DEFAULT_PASSWORD = "Vtpl@2026";

async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (passwordHash === null) {
    return password === DEFAULT_PASSWORD;
  }
  return bcrypt.compare(password, passwordHash);
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid email or password. Please contact admin if you need access." });
    return;
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    res.status(401).json({ error: "Invalid email or password. Please contact admin if you need access." });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await db.insert(sessionsTable).values({ token, userId: user.id, expiresAt });
  // Audit failures must never prevent a verified user from signing in.
  try {
    const usageSession = await createUsageSession(token, user.id);
    await recordAuditEvent({ userId: user.id, actorName: user.name, sessionId: usageSession.id, eventType: "login" });
  } catch (err) {
    logger.error({ err, userId: user.id }, "Unable to start usage audit session");
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt?.toISOString(),
    },
    token,
  });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  if (newPassword === DEFAULT_PASSWORD) {
    res.status(400).json({ error: "New password cannot be the default password." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db
    .update(usersTable)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(usersTable.id, user.id));

  // Revoke every other session for this user so old tokens can't keep using the old password.
  const currentToken = extractToken(req);
  if (currentToken) {
    await db
      .delete(sessionsTable)
      .where(and(eq(sessionsTable.userId, user.id), ne(sessionsTable.token, currentToken)));
  }

  res.json({ success: true });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  if (req.usageSessionId != null) {
    try {
      await recordAuditEvent({ userId: req.userId!, actorName: req.userName ?? "Unknown", sessionId: req.usageSessionId, eventType: "logout" });
      await endUsageSession(req.usageSessionId);
    } catch (err) {
      logger.error({ err, userId: req.userId }, "Unable to close usage audit session");
    }
  }
  const token = extractToken(req);
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  res.json(
    GetMeResponse.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt?.toISOString(),
    })
  );
});

export default router;

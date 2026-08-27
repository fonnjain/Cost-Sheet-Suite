import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sessionsTable, usersTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { findOrCreateUsageSession } from "../lib/usage-audit";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
      userName?: string;
      usageSessionId?: number;
    }
  }
}

export function extractToken(req: Request): string | undefined {
  const bearer = req.headers["authorization"];
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice(7);
  }
  return (req.headers["x-session-token"] as string | undefined);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token), gt(sessionsTable.expiresAt, new Date())));

  if (!session) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  // Until the user replaces the default password, only allow the auth endpoints
  // needed to complete the forced password change.
  const allowedWhilePending = ["/auth/change-password", "/auth/logout", "/auth/me"];
  if (user.mustChangePassword && !allowedWhilePending.includes(req.path)) {
    res.status(403).json({ error: "Password change required" });
    return;
  }

  req.userId = user.id;
  req.userRole = user.role;
  req.userName = user.name;
  // Authentication remains available if the non-critical audit store is unavailable.
  try {
    const usageSession = await findOrCreateUsageSession(token, user.id);
    req.usageSessionId = usageSession.id;
  } catch (err) {
    logger.error({ err, userId: user.id }, "Unable to initialize usage audit session");
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

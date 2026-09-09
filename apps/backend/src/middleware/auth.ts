import type { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";

/* eslint-disable @typescript-eslint/no-namespace -- this is the standard
   way to augment Express's Request type. */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

/** Rejects unauthenticated requests; sets `req.userId`/`req.userRole` for handlers downstream. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  req.userId = session.user.id;
  req.userRole = (session.user as { role?: string }).role ?? "user";
  next();
}

/**
 * Rejects non-admins. Must be mounted after `requireAuth`, which is what
 * populates `req.userRole`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

import { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { SESSION_COOKIE, clearSessionCookie, hashToken } from "../services/session.js";

// The authenticated user attached to every protected request (api-spec.md §0 "Common guards").
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}

export function serializeUser(u: AuthUser): AuthUser {
  // Explicit field list — passwordHash and friends can never leak through here.
  return { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword };
}

function unauthenticated(res: Response) {
  clearSessionCookie(res);
  return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
}

// Guard 1 — valid, unexpired session whose user is still active (BR-08, BR-10, AC-30).
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") return unauthenticated(res);

  try {
    const session = await getPrisma().session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
      if (session) await getPrisma().session.delete({ where: { id: session.id } }).catch(() => {});
      return unauthenticated(res);
    }
    req.user = serializeUser(session.user);
    req.sessionToken = token;
    next();
  } catch {
    res.status(500).json({ error: "Unable to verify session" });
  }
}

// Guard 2 — BR-06: a user who must change their password may only reach the auth endpoints that
// let them do so (me / logout / change-password are mounted without this guard).
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword) {
    return res.status(403).json({
      error: "You must change your password before continuing.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  }
  next();
}

// Guard 3 — BR-14: role allow-list, evaluated before any resource lookup (BR-18).
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do that.", code: "FORBIDDEN" });
    }
    next();
  };
}

// Convenience stacks used by the route files.
export const authenticated = [requireAuth, requirePasswordChanged];
export const asRequester = [...authenticated, requireRole("REQUESTER")];
export const asStaff = [...authenticated, requireRole("IT_STAFF", "ADMIN")];
export const asAdmin = [...authenticated, requireRole("ADMIN")];

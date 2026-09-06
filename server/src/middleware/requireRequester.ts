import { NextFunction, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

// BR-09 — every Requester-scoped endpoint requires X-Requester-Id, resolved against an active
// RequesterUser. This stands in for a real session (BR-24) until Lab 3's authentication lands.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requesterId?: number;
    }
  }
}

export async function requireRequester(req: Request, res: Response, next: NextFunction) {
  const header = req.header("X-Requester-Id");
  const requesterId = header ? Number(header) : NaN;

  // Must be a positive integer within Postgres's `integer` range — Number("1.5"),
  // Number("Infinity"), and Number("1e10") are all "numbers" but not valid ids, and would
  // otherwise reach Prisma and throw (500 from an out-of-range DB error) instead of failing
  // as 401 (BR-09). No id can ever legitimately be outside this range, so treat it as 401.
  const POSTGRES_INT_MAX = 2147483647;
  if (!header || !Number.isInteger(requesterId) || requesterId <= 0 || requesterId > POSTGRES_INT_MAX) {
    return res.status(401).json({ error: "Missing or invalid X-Requester-Id" });
  }

  try {
    const requester = await getPrisma().requesterUser.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res.status(401).json({ error: "Unknown or inactive development requester" });
    }
    req.requesterId = requesterId;
    next();
  } catch {
    // The id itself is already validated above (integer, in-range) — a failure here is a real
    // infra problem (e.g. DB unreachable), so it's a 500, not a 401.
    res.status(500).json({ error: "Unable to verify development requester" });
  }
}

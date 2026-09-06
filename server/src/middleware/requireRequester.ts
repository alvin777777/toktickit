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

  if (!header || Number.isNaN(requesterId)) {
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
    res.status(500).json({ error: "Unable to verify development requester" });
  }
}

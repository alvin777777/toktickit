import { NextFunction, Request, Response } from "express";

// BR-09a — CSRF control. SameSite=Lax and CORS are not enough: SameSite is site-scoped (another
// port or a sibling subdomain is "same-site") and CORS never blocks simple form / no-cors POSTs,
// which would still carry the session cookie. So every unsafe method must prove it came from our
// own client: the `Origin` header (or, when a browser omits it, the `Referer`) must match
// CLIENT_ORIGIN exactly. Evaluated before authentication so a forged request never reaches a
// handler. Non-browser clients (tests, curl) must set the header explicitly.
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function allowedOrigin(): string {
  return process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
}

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE.has(req.method)) return next();
  const presented = originOf(req.header("origin")) ?? originOf(req.header("referer"));
  if (presented !== allowedOrigin()) {
    return res.status(403).json({ error: "Request origin not allowed", code: "CSRF_REJECTED" });
  }
  next();
}

import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { hashPassword, passwordRuleFailure, verifyPassword } from "../services/password.js";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  deleteSessionByToken,
  hashToken,
  setSessionCookie,
} from "../services/session.js";
import { requireAuth, serializeUser } from "../middleware/auth.js";

export const authRouter = Router();

// BR-03 — emails are compared on their trimmed, lower-cased form.
export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// api-spec.md §1.1 — POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post("/login", async (req: Request, res: Response) => {
  const email = normalizeEmail(req.body?.email);
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const fields: Record<string, string> = {};
  if (!email) fields.email = "Email is required.";
  if (!password) fields.password = "Password is required.";
  if (Object.keys(fields).length > 0) return res.status(400).json({ error: "Invalid login data", fields });

  try {
    const user = await getPrisma().user.findUnique({ where: { email } });
    // BR-01 — unknown email and wrong password are indistinguishable. The hash check still runs
    // against a dummy value for unknown users so response timing does not reveal existence.
    const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyPassword(password, DUMMY_HASH);
    if (!user || !ok) {
      return res.status(401).json({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    }
    // BR-02 — only a correct password earns the explicit inactive-account message.
    if (!user.isActive) {
      return res
        .status(403)
        .json({ error: "This account is inactive. Contact an administrator.", code: "ACCOUNT_INACTIVE" });
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.status(200).json({ user: serializeUser(user) });
  } catch {
    res.status(500).json({ error: "Unable to sign in right now" });
  }
});

// A real scrypt hash of a random string — verifying against it costs the same as a real check.
const DUMMY_HASH =
  "scrypt$16384$8$1$P1q6MYnxgEBcT4uPL2Y+tg==$A8kiuNlWSOJ/FEmjuNSQ1a7pnWHGfw54c382+s3HeNypUV0ZHDlTk6e/Os6AZkB8KLpg5Dg9XqaauxXMEVTknQ==";

// ---------------------------------------------------------------------------
// api-spec.md §1.2 — POST /api/auth/logout (always 204, BR-09)
// ---------------------------------------------------------------------------
authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  try {
    if (token) await deleteSessionByToken(token);
  } catch {
    // Nothing useful to tell the client — the cookie is cleared regardless.
  }
  clearSessionCookie(res);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// api-spec.md §1.3 — GET /api/auth/me (allowed while mustChangePassword is true)
// ---------------------------------------------------------------------------
authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  res.status(200).json({ user: req.user });
});

// ---------------------------------------------------------------------------
// api-spec.md §1.4 — POST /api/auth/change-password (BR-05, BR-07)
// ---------------------------------------------------------------------------
authRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
  const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : "";

  const fields: Record<string, string> = {};
  if (!currentPassword) fields.currentPassword = "Current password is required.";
  const ruleFailure = passwordRuleFailure(newPassword);
  if (ruleFailure) fields.newPassword = ruleFailure;
  else if (newPassword === currentPassword) fields.newPassword = "New password must differ from the current password.";
  if (confirmPassword !== newPassword) fields.confirmPassword = "Passwords do not match.";

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (currentPassword && !(await verifyPassword(currentPassword, user.passwordHash))) {
      fields.currentPassword = "Current password is incorrect.";
    }
    if (Object.keys(fields).length > 0) return res.status(400).json({ error: "Invalid password change", fields });

    // BR-07 / AC-36 — the password update and the revocation of every *other* session are one
    // transaction: either both happen or neither (review on PR #40).
    const newHash = await hashPassword(newPassword);
    const [updated] = await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash, mustChangePassword: false } }),
      prisma.session.deleteMany({ where: { userId: user.id, tokenHash: { not: hashToken(req.sessionToken!) } } }),
    ]);
    res.status(200).json({ user: serializeUser(updated) });
  } catch {
    res.status(500).json({ error: "Unable to change password right now" });
  }
});

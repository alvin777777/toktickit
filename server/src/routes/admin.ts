import { Router, Request, Response } from "express";
import { Prisma, type UserRole } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { asAdmin } from "../middleware/auth.js";
import { hashPassword, passwordRuleFailure } from "../services/password.js";
import { normalizeEmail } from "./auth.js";

// Lab 3 Issue 5 — minimalist Administrator user management (docs/lab-03/api-spec.md §5).
// Every route sits behind asAdmin, so non-Administrators get 403 with no user data (AC-29).
export const adminRouter = Router();
adminRouter.use(...asAdmin);

const ROLES: UserRole[] = ["REQUESTER", "IT_STAFF", "ADMIN"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect; // passwordHash is never selected, so it can never be serialized

type Fields = Record<string, string>;

// BR-19 / BR-41 — shared field validation; returns the normalized values that passed.
function validateProfile(body: Record<string, unknown>, partial: boolean) {
  const fields: Fields = {};
  const data: { name?: string; email?: string; role?: UserRole; isActive?: boolean } = {};

  if (!partial || "name" in body) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 100) fields.name = "Name must be 2-100 characters.";
    else data.name = name;
  }
  if (!partial || "email" in body) {
    const email = normalizeEmail(body.email);
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) fields.email = "Enter a valid email address.";
    else data.email = email;
  }
  if (!partial || "role" in body) {
    if (!ROLES.includes(body.role as UserRole)) fields.role = "Select a valid role.";
    else data.role = body.role as UserRole;
  }
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") fields.isActive = "Must be true or false.";
    else data.isActive = body.isActive;
  }
  return { fields, data };
}

function emailTaken(res: Response) {
  return res.status(409).json({
    error: "A user with this email already exists.",
    code: "EMAIL_TAKEN",
    fields: { email: "A user with this email already exists." },
  });
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// Thrown inside a transaction to roll it back and answer with a documented conflict.
class Conflict extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// §5.1 — GET /api/admin/users
// ---------------------------------------------------------------------------
adminRouter.get("/users", async (req: Request, res: Response) => {
  const where: Prisma.UserWhereInput = {};
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }];
  }
  if (ROLES.includes(req.query.role as UserRole)) where.role = req.query.role as UserRole; // invalid → ignored
  try {
    const users = await getPrisma().user.findMany({ where, orderBy: { name: "asc" }, select: adminUserSelect });
    res.status(200).json(users);
  } catch {
    res.status(500).json({ error: "Unable to load users" });
  }
});

// ---------------------------------------------------------------------------
// §5.2 — POST /api/admin/users (BR-19, BR-20, BR-40, BR-41)
// ---------------------------------------------------------------------------
adminRouter.post("/users", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { fields, data } = validateProfile(body, false);
  const initialPassword = typeof body.initialPassword === "string" ? body.initialPassword : "";
  const ruleFailure = passwordRuleFailure(initialPassword);
  if (ruleFailure) fields.initialPassword = ruleFailure;
  if (Object.keys(fields).length > 0) return res.status(400).json({ error: "Invalid user data", fields });

  try {
    const prisma = getPrisma();
    if (await prisma.user.findUnique({ where: { email: data.email! } })) return emailTaken(res);
    const user = await prisma.user.create({
      data: {
        name: data.name!,
        email: data.email!,
        role: data.role!,
        isActive: data.isActive ?? true,
        passwordHash: await hashPassword(initialPassword),
        mustChangePassword: true, // BR-20
      },
      select: adminUserSelect,
    });
    res.status(201).json(user);
  } catch (err) {
    if (isUniqueViolation(err)) return emailTaken(res);
    res.status(500).json({ error: "Unable to create user" });
  }
});

// ---------------------------------------------------------------------------
// §5.3 — PATCH /api/admin/users/:id (BR-10, BR-40, BR-42, BR-43)
// ---------------------------------------------------------------------------
adminRouter.patch("/users/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "User not found" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const provided = ["name", "email", "role", "isActive"].filter((k) => k in body);
  if (provided.length === 0) {
    return res.status(400).json({ error: "Nothing to update", fields: { body: "Provide name, email, role, or isActive." } });
  }
  const { fields, data } = validateProfile(body, true);
  if (Object.keys(fields).length > 0) return res.status(400).json({ error: "Invalid user data", fields });

  try {
    const prisma = getPrisma();
    // BR-42/BR-43/BR-10 + AC-35/AC-36 — the safety checks, the update, and the session revocation
    // are one transaction. The active-Administrator rows are locked (SELECT … FOR UPDATE) before the
    // LAST_ADMIN decision, so two concurrent demotions serialize and the second one sees the first
    // (review on PR #43).
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new Conflict(404, "NOT_FOUND", "User not found");

      if (data.email && data.email !== target.email) {
        const clash = await tx.user.findUnique({ where: { email: data.email } });
        if (clash) throw new Conflict(409, "EMAIL_TAKEN", "A user with this email already exists.", { email: "A user with this email already exists." });
      }
      const deactivating = data.isActive === false && target.isActive;
      if (deactivating && target.id === req.user!.id) {
        throw new Conflict(409, "SELF_DEACTIVATION", "You cannot deactivate your own account.");
      }
      const losesAdmin = target.role === "ADMIN" && target.isActive && (deactivating || (data.role && data.role !== "ADMIN"));
      if (losesAdmin) {
        const locked = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "User" WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
        if (locked.length <= 1) throw new Conflict(409, "LAST_ADMIN", "At least one active Administrator is required.");
      }

      const updated = await tx.user.update({ where: { id }, data, select: adminUserSelect });
      if (deactivating) await tx.session.deleteMany({ where: { userId: id } }); // BR-10, same transaction
      return updated;
    });
    res.status(200).json(user);
  } catch (err) {
    if (err instanceof Conflict) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.fields ? { fields: err.fields } : {}) });
    if (isUniqueViolation(err)) return emailTaken(res);
    res.status(500).json({ error: "Unable to update user" });
  }
});

// ---------------------------------------------------------------------------
// §5.4 — POST /api/admin/users/:id/initial-password (BR-44)
// ---------------------------------------------------------------------------
adminRouter.post("/users/:id/initial-password", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: "User not found" });
  const initialPassword = typeof req.body?.initialPassword === "string" ? req.body.initialPassword : "";
  const ruleFailure = passwordRuleFailure(initialPassword);
  if (ruleFailure) return res.status(400).json({ error: "Invalid initial password", fields: { initialPassword: ruleFailure } });

  try {
    const prisma = getPrisma();
    if (!(await prisma.user.findUnique({ where: { id } }))) return res.status(404).json({ error: "User not found" });
    // BR-44 / AC-36 — new credential and session revocation are one transaction (review on PR #43).
    const newHash = await hashPassword(initialPassword);
    const [user] = await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash: newHash, mustChangePassword: true }, select: adminUserSelect }),
      prisma.session.deleteMany({ where: { userId: id } }),
    ]);
    res.status(200).json(user); // the password itself is never echoed back
  } catch {
    res.status(500).json({ error: "Unable to set initial password" });
  }
});

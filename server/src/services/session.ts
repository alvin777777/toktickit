import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { getPrisma } from "../prisma.js";

// BR-08 — opaque 256-bit token in an httpOnly cookie; only its SHA-256 hash is stored, so a DB
// leak does not hand out usable sessions. 8-hour absolute lifetime.
export const SESSION_COOKIE = "toktickit_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getPrisma().session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// BR-10 — used on deactivation and when an Administrator sets a new initial password.
export async function deleteAllSessionsForUser(userId: number, exceptToken?: string): Promise<void> {
  await getPrisma().session.deleteMany({
    where: { userId, ...(exceptToken ? { tokenHash: { not: hashToken(exceptToken) } } : {}) },
  });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

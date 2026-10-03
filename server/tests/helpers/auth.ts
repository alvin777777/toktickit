import request from "supertest";
import { app } from "../../src/app.js";

// Shared by every Lab 2 regression test and Lab 3 API test (docs/lab-03/tests.md §1): sign in as a
// seeded account and return the `Cookie` header value to attach to subsequent requests. Seeded
// credentials come from prisma/seed.ts (local development only).
export const SEED_PASSWORD = "Password123!";

export const SEEDED = {
  requesterA: "jennifer.anderson@toktickit.dev",
  requesterB: "michael.brown@toktickit.dev",
  requesterC: "sarah.johnson@toktickit.dev",
  inactiveRequester: "former.employee@toktickit.dev",
  firstLoginRequester: "alex.thompson@toktickit.dev",
  staffA: "emily.davis@toktickit.dev",
  staffB: "kevin.patel@toktickit.dev",
  inactiveStaff: "robert.wilson@toktickit.dev",
  admin: "john.smith@toktickit.dev",
};

export async function loginAs(email: string, password = SEED_PASSWORD): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${email}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return cookieFrom(res);
}

export function cookieFrom(res: request.Response): string {
  const header = res.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new Error("response carried no Set-Cookie header");
  return raw.split(";")[0];
}

export const asRequester = () => loginAs(SEEDED.requesterA);
export const asRequesterB = () => loginAs(SEEDED.requesterB);
export const asStaff = () => loginAs(SEEDED.staffA);
export const asStaffB = () => loginAs(SEEDED.staffB);
export const asAdmin = () => loginAs(SEEDED.admin);

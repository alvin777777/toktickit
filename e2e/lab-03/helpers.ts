import { APIRequestContext, Page, expect } from "@playwright/test";

// Shared by the Lab 3 E2E specs. Seeded credentials come from server/prisma/seed.ts (local
// development only — see README.md).
export const API = "http://localhost:3001";
export const SEED_PASSWORD = "Password123!";
export const ACCOUNTS = {
  requester: "jennifer.anderson@toktickit.dev",
  requesterB: "michael.brown@toktickit.dev",
  staff: "emily.davis@toktickit.dev",
  admin: "john.smith@toktickit.dev",
};

export async function login(page: Page, email: string, password = SEED_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

export async function loginExpectingHome(page: Page, email: string, home: RegExp, password = SEED_PASSWORD) {
  await login(page, email, password);
  await expect(page).toHaveURL(home);
}

// Creates a throwaway user through the real Administrator API so first-login flows are repeatable
// without mutating seeded accounts.
export async function createUserViaApi(
  request: APIRequestContext,
  input: { name: string; email: string; role: "REQUESTER" | "IT_STAFF" | "ADMIN"; initialPassword: string }
) {
  const login = await request.post(`${API}/api/auth/login`, { data: { email: ACCOUNTS.admin, password: SEED_PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const res = await request.post(`${API}/api/admin/users`, { data: { ...input, isActive: true } });
  expect(res.status(), await res.text()).toBe(201);
  await request.post(`${API}/api/auth/logout`);
  return (await res.json()) as { id: number; email: string };
}

// ui-spec.md §2 — below 768px the nav and user block live inside the hamburger menu.
export async function openNav(page: Page) {
  const toggler = page.getByRole("button", { name: /toggle navigation/i });
  if (await toggler.isVisible()) {
    await toggler.click();
    await expect(page.locator("#appShellNav")).toHaveClass(/show/);
  }
}

export async function createTicketAsRequester(page: Page, summary: string) {
  await page.getByRole("link", { name: "+ Create Ticket" }).click();
  await page.getByLabel(/^Category/).selectOption({ index: 1 });
  await page.getByLabel(/Related System/).selectOption({ index: 1 });
  await page.getByLabel(/Requested Priority/).selectOption("MEDIUM");
  await page.getByLabel(/^Summary/).fill(summary);
  await page.getByLabel(/^Description/).fill("Created by the Lab 3 E2E suite to exercise the full workflow.");
  await page.getByRole("button", { name: /create ticket/i }).click();
  const ticketNumber = await page.getByText(/^TKT-\d{4}-\d{6}$/).textContent();
  expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  return ticketNumber!;
}

import { Page, expect } from "@playwright/test";
import { ACCOUNTS, SEED_PASSWORD, createTicketAsRequester, login } from "../lab-03/helpers.js";

// Lab 4 E2E helpers (docs/lab-04/tests.md). Seeded accounts: server/prisma/seed.ts (local only).
export { ACCOUNTS, SEED_PASSWORD, createTicketAsRequester };
export const STAFF_B = "kevin.patel@toktickit.dev";

// BR-38 — every role lands on its Dashboard.
export async function signIn(page: Page, email: string) {
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("metric-card").first()).toBeVisible();
}

export async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

export function shot(group: string, name: string) {
  return `../artifacts/lab-04/screenshots/${group}/${name}.png`;
}

// A fresh ticket owned by Jennifer, opened by staff on its Actions Taken tab.
export async function newTicketForStaff(requesterPage: Page, summary: string) {
  await signIn(requesterPage, ACCOUNTS.requester);
  return createTicketAsRequester(requesterPage, summary);
}

export async function addAction(
  page: Page,
  input: { description: string; result?: string; status?: "COMPLETED" | "IN_PROGRESS" | "PLANNED"; performer?: string; followUp?: string; attachmentNotes?: string }
) {
  await page.getByRole("button", { name: "+ Add Action" }).click();
  const form = page.getByRole("form", { name: "New action" });
  if (input.status) await form.getByLabel("Status").selectOption(input.status);
  if (input.performer) await form.getByLabel("Performed by").selectOption({ label: input.performer });
  await form.getByLabel("Action Description").fill(input.description);
  if (input.result) await form.getByLabel(/^Result/).fill(input.result);
  if (input.followUp) {
    await form.getByLabel("Follow-Up Required?").check();
    await form.getByLabel(/Follow-up Note/).fill(input.followUp);
  }
  if (input.attachmentNotes) await form.getByLabel("Attachment Notes").fill(input.attachmentNotes);
  await form.getByRole("button", { name: "Save Action" }).click();
  await expect(page.getByText("Action saved.")).toBeVisible();
}

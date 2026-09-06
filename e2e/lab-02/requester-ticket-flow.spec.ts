import { test, expect } from "@playwright/test";

// E2E-01 (AC-01, AC-13) — full Requester flow: select requester → create ticket →
// find it in My Tickets → open Detail and confirm the same data is shown.
// E2E-02 (AC-03, AC-20) — cross-Requester isolation: Requester B cannot see or open
// Requester A's ticket by URL.
//
// Requires the seeded dev DB (server/prisma/seed.ts) and both dev servers running —
// see README.md. Each run creates a real ticket, so the summary includes a timestamp
// to keep repeated runs distinguishable in My Tickets' search.

test.describe("Requester ticket flow", () => {
  test("select requester, create a ticket, find it in My Tickets, open Detail", async ({ page }) => {
    const summary = `E2E flow ticket ${Date.now()}`;

    await page.goto("/select");
    await page.getByLabel(/Development Requester/i).selectOption({ label: "Jennifer Anderson" });
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page).toHaveURL(/\/tickets$/);
    await page.getByRole("link", { name: "+ Create Ticket" }).click();

    await page.getByLabel(/^Category/).selectOption({ index: 1 });
    await page.getByLabel(/Related System/).selectOption({ index: 1 });
    await page.getByLabel(/Requested Priority/).selectOption("MEDIUM");
    await page.getByLabel(/^Summary/).fill(summary);
    await page.getByLabel(/^Description/).fill("Created by the Lab 2 E2E test to verify the full flow.");
    await page.getByRole("button", { name: /create ticket/i }).click();

    await expect(page.getByText(/^TKT-\d{4}-\d{6}$/)).toBeVisible();
    const ticketNumber = await page.getByText(/^TKT-\d{4}-\d{6}$/).textContent();

    await page.getByRole("link", { name: /view my tickets/i }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await page.getByLabel(/search tickets/i).fill(summary);
    // The summary/ticket number appear in both the desktop table row and the mobile card markup
    // at once — only one is actually visible via CSS at a given viewport (Bootstrap's
    // d-none/d-md-none), and `.first()` picks DOM order, not visibility, so filter to `:visible`.
    const visibleRow = page.getByText(summary).and(page.locator(":visible"));
    await expect(visibleRow).toBeVisible();

    await page.getByText(ticketNumber!).and(page.locator(":visible")).click();
    await expect(page).toHaveURL(new RegExp(`/tickets/${ticketNumber}`));
    await expect(page.getByLabel("Summary")).toHaveValue(summary);
  });

  test("Requester B cannot see or open Requester A's ticket", async ({ page, context }) => {
    // Create a ticket as Requester A.
    const summary = `Isolation test ${Date.now()}`;
    await page.goto("/select");
    await page.getByLabel(/Development Requester/i).selectOption({ label: "Jennifer Anderson" });
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("link", { name: "+ Create Ticket" }).click();
    await page.getByLabel(/^Category/).selectOption({ index: 1 });
    await page.getByLabel(/Related System/).selectOption({ index: 1 });
    await page.getByLabel(/Requested Priority/).selectOption("LOW");
    await page.getByLabel(/^Summary/).fill(summary);
    await page.getByLabel(/^Description/).fill("Owned by Requester A only, per E2E-02.");
    await page.getByRole("button", { name: /create ticket/i }).click();
    const ticketNumber = await page.getByText(/^TKT-\d{4}-\d{6}$/).textContent();

    // Switch to Requester B in a fresh context (own localStorage) and check isolation.
    const pageB = await context.newPage();
    await pageB.goto("/select");
    await pageB.getByLabel(/Development Requester/i).selectOption({ label: "Michael Brown" });
    await pageB.getByRole("button", { name: /continue/i }).click();
    await pageB.getByLabel(/search tickets/i).fill(summary);
    await expect(pageB.getByText(summary)).toHaveCount(0);

    await pageB.goto(`/tickets/${ticketNumber}`);
    await expect(pageB.getByText(/ticket not found/i)).toBeVisible();
  });
});

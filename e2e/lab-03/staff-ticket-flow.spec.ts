import { test, expect } from "@playwright/test";
import { ACCOUNTS, createTicketAsRequester, loginExpectingHome } from "./helpers.js";

// E2E-03 (AC-10) and E2E-04 (AC-13..AC-20) — docs/lab-03/tests.md.

test.describe("IT Staff ticket flow", () => {
  test("requester creates a ticket; IT Staff claims, prioritises, notes, comments, resolves, closes; requester sees only public content", async ({
    page,
    browser,
  }) => {
    // --- E2E-03: Requester creates a ticket from the authenticated identity (no selector) ---
    const summary = `E2E workflow ${Date.now()}`;
    await loginExpectingHome(page, ACCOUNTS.requester, /\/tickets$/);
    const ticketNumber = await createTicketAsRequester(page, summary);
    await page.getByRole("link", { name: /view my tickets/i }).click();
    await page.getByLabel(/search tickets/i).fill(summary);
    await expect(page.getByText(summary).and(page.locator(":visible"))).toBeVisible();

    // --- E2E-04: IT Staff works the ticket ---
    const staffPage = await browser.newPage();
    await loginExpectingHome(staffPage, ACCOUNTS.staff, /\/staff\/queue$/);
    await expect(staffPage.getByTestId("current-user")).toContainText("IT Staff");
    await staffPage.getByLabel(/search queue/i).fill(ticketNumber);
    await staffPage.getByText(ticketNumber).and(staffPage.locator(":visible")).first().click();
    await expect(staffPage).toHaveURL(new RegExp(`/staff/tickets/${ticketNumber}`));
    await expect(staffPage.getByLabel("Requester", { exact: true })).toHaveValue("Jennifer Anderson");

    // Claim → owner = Emily, status Open (AC-15)
    await staffPage.getByRole("button", { name: /^claim$/i }).click();
    await expect(staffPage.getByTestId("owner-name")).toHaveText("Emily Davis");
    await expect(staffPage.getByRole("heading", { level: 1 })).toContainText("Open");

    // IT Priority → High, Requested stays Medium (AC-17)
    await staffPage.getByLabel(/^IT Priority/i).selectOption("HIGH");
    await expect(staffPage.getByRole("status")).toHaveText("Saved");
    await expect(staffPage.getByTestId("requested-priority")).toHaveText("MEDIUM");

    // Status → In Progress (AC-18)
    await staffPage.getByLabel(/^Status/i).selectOption("IN_PROGRESS");
    await staffPage.getByRole("button", { name: /update status/i }).click();
    await expect(staffPage.getByRole("heading", { level: 1 })).toContainText("In Progress");

    // Internal note (AC-20) and public comment (AC-11)
    const secret = `SECRET-NOTE-${Date.now()}`;
    await staffPage.getByRole("tab", { name: /internal notes/i }).click();
    await staffPage.getByLabel(/add internal note/i).fill(secret);
    await staffPage.getByRole("button", { name: /add note/i }).click();
    await expect(staffPage.getByTestId("internal-notes")).toContainText(secret);

    await staffPage.getByRole("tab", { name: /public comments/i }).click();
    await staffPage.getByLabel(/add a public comment/i).fill("We replaced the battery. Please confirm it holds charge.");
    await staffPage.getByRole("button", { name: /post comment/i }).click();
    await expect(staffPage.getByTestId("public-comments")).toContainText("We replaced the battery");

    // Resolved → Closed with confirmation (AC-18, BR-31)
    await staffPage.getByLabel(/^Status/i).selectOption("RESOLVED");
    await staffPage.getByRole("button", { name: /update status/i }).click();
    await expect(staffPage.getByRole("heading", { level: 1 })).toContainText("Resolved");
    await staffPage.getByLabel(/^Status/i).selectOption("CLOSED");
    await staffPage.getByRole("button", { name: /update status/i }).click();
    await expect(staffPage.getByRole("alertdialog")).toContainText(/close this ticket/i);
    await staffPage.getByRole("button", { name: /yes, closed it/i }).click();
    await expect(staffPage.getByRole("heading", { level: 1 })).toContainText("Closed");
    await expect(staffPage.getByRole("button", { name: /^claim$/i })).toHaveCount(0);
    await staffPage.close();

    // --- Requester sees the public comment and the closed status, never the internal note ---
    await page.goto(`/tickets/${ticketNumber}`);
    await expect(page.getByTestId("public-comments")).toContainText("We replaced the battery");
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(page.locator("#detail-owner")).toHaveValue("Emily Davis"); // Ticket Owner
    await expect(page.getByText(secret)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Internal Notes");
    await expect(page.getByText(/comments are closed for this ticket/i)).toBeVisible();

    // A Requester opening a staff URL gets the forbidden card, not data (AC-09).
    await page.goto(`/staff/tickets/${ticketNumber}`);
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });

  test("requester marks a problem as appearing resolved and IT Staff sees the signal", async ({ page, browser }) => {
    const summary = `E2E appears resolved ${Date.now()}`;
    await loginExpectingHome(page, ACCOUNTS.requester, /\/tickets$/);
    const ticketNumber = await createTicketAsRequester(page, summary);
    await page.goto(`/tickets/${ticketNumber}`);
    await page.getByRole("button", { name: /problem appears resolved/i }).click();
    await page.getByRole("button", { name: /yes, it appears resolved/i }).click();
    await expect(page.getByTestId("resolved-chip")).toBeVisible();
    await expect(page.getByText("New", { exact: true })).toBeVisible(); // status unchanged (BR-32)

    const staffPage = await browser.newPage();
    await loginExpectingHome(staffPage, ACCOUNTS.staff, /\/staff\/queue$/);
    await staffPage.getByLabel(/search queue/i).fill(ticketNumber);
    await expect(staffPage.getByText(/requester says resolved/i).and(staffPage.locator(":visible")).first()).toBeVisible();
    await staffPage.goto(`/staff/tickets/${ticketNumber}`);
    await expect(staffPage.getByTestId("requester-resolved-banner")).toBeVisible();
    await staffPage.close();
  });
});

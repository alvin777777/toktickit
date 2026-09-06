import { test, expect, Page } from "@playwright/test";

// RESP-01 (AC-19) — desktop/tablet/mobile screenshots for Create Ticket, My Tickets, and
// Ticket Detail, plus an automated check that nothing causes horizontal page scrolling.
// This file runs once per Playwright project (desktop/tablet/mobile — see playwright.config.ts),
// so each screenshot below is captured at all three widths across separate runs.

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding
}

async function selectRequester(page: Page) {
  await page.goto("/select");
  await page.getByLabel(/Development Requester/i).selectOption({ label: "Jennifer Anderson" });
  await page.getByRole("button", { name: /continue/i }).click();
}

test.describe("Responsive / visual QA", () => {
  test("My Tickets — no horizontal scroll, screenshot saved", async ({ page }, testInfo) => {
    await selectRequester(page);
    await expect(page).toHaveURL(/\/tickets$/);
    await assertNoHorizontalScroll(page);
    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/my-tickets/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });

  test("Create Ticket — no horizontal scroll, screenshot saved", async ({ page }, testInfo) => {
    await selectRequester(page);
    await page.getByRole("link", { name: "+ Create Ticket" }).click();
    await assertNoHorizontalScroll(page);
    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/create-ticket/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });

  test("Ticket Detail — no horizontal scroll, screenshot saved", async ({ page }, testInfo) => {
    await selectRequester(page);
    // Create a ticket to have a real Detail page to open.
    await page.getByRole("link", { name: "+ Create Ticket" }).click();
    await page.getByLabel(/^Category/).selectOption({ index: 1 });
    await page.getByLabel(/Related System/).selectOption({ index: 1 });
    await page.getByLabel(/Requested Priority/).selectOption("HIGH");
    await page.getByLabel(/^Summary/).fill(`Visual QA ticket ${Date.now()}`);
    await page.getByLabel(/^Description/).fill("Created for responsive/visual QA screenshots (Issue 6).");
    await page.getByRole("button", { name: /create ticket/i }).click();
    await page.getByRole("link", { name: /view my tickets/i }).click();

    const ticketNumber = await page.getByText(/^TKT-\d{4}-\d{6}$/).first().textContent();
    await page.goto(`/tickets/${ticketNumber}`);

    await assertNoHorizontalScroll(page);
    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/ticket-detail/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
});

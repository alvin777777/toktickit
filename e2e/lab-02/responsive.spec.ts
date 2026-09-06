import { test, expect, Page } from "@playwright/test";

// RESP-01 (AC-19) — desktop/tablet/mobile screenshots for Create Ticket, My Tickets, and
// Ticket Detail, plus automated checks that (a) nothing causes horizontal page scrolling and
// (b) the actual column/layout breakpoints required by ui-spec.md are respected, not just that
// a screenshot happens to look right — see review on PR #28.
// This file runs once per Playwright project (desktop/tablet/mobile — see playwright.config.ts),
// so each screenshot/assertion below runs at all three widths across separate runs.

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding
}

// ui-spec.md §6 — tablet gets 2 columns where desktop has 3+; asserted by comparing the
// vertical position of three same-row fields, not just eyeballing a screenshot.
async function assertFieldRowLayout(page: Page, labels: string[], projectName: string) {
  const tops = await Promise.all(labels.map((label) => page.getByLabel(label, { exact: false }).boundingBox()));
  const [first, second, third] = tops.map((box) => box!.y);

  if (projectName === "desktop") {
    expect(third).toBeCloseTo(first, 0); // all three share one row
  } else if (projectName === "tablet") {
    expect(second).toBeCloseTo(first, 0); // first two share a row...
    expect(third).toBeGreaterThan(first + 10); // ...third wraps to the next row
  } else {
    // mobile: every field stacks on its own row
    expect(second).toBeGreaterThan(first + 10);
    expect(third).toBeGreaterThan(second + 10);
  }
}

async function selectRequester(page: Page) {
  await page.goto("/select");
  await page.getByLabel(/Development Requester/i).selectOption({ label: "Jennifer Anderson" });
  await page.getByRole("button", { name: /continue/i }).click();
}

test.describe("Responsive / visual QA", () => {
  test("My Tickets — table only at desktop (lg+), cards below lg, no horizontal scroll", async ({
    page,
  }, testInfo) => {
    await selectRequester(page);
    await expect(page).toHaveURL(/\/tickets$/);
    await assertNoHorizontalScroll(page);

    // ui-spec.md §5.4 — desktop (>=992px) shows the table; tablet and mobile (<992px) show cards.
    if (testInfo.project.name === "desktop") {
      await expect(page.getByTestId("my-tickets-table")).toBeVisible();
      await expect(page.getByTestId("my-tickets-cards")).toBeHidden();
    } else {
      await expect(page.getByTestId("my-tickets-table")).toBeHidden();
      await expect(page.getByTestId("my-tickets-cards")).toBeVisible();
    }

    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/my-tickets/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });

  test("Create Ticket — 3 columns on desktop, 2 on tablet, 1 on mobile; no horizontal scroll", async ({
    page,
  }, testInfo) => {
    await selectRequester(page);
    await page.getByRole("link", { name: "+ Create Ticket" }).click();
    await assertNoHorizontalScroll(page);
    await assertFieldRowLayout(page, ["Category", "Related System", "Requested Priority"], testInfo.project.name);
    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/create-ticket/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });

  test("Ticket Detail — 3 columns on desktop, 2 on tablet, 1 on mobile; no horizontal scroll", async ({
    page,
  }, testInfo) => {
    await selectRequester(page);
    // Create a ticket to have a real Detail page to open.
    await page.getByRole("link", { name: "+ Create Ticket" }).click();
    await page.getByLabel(/^Category/).selectOption({ index: 1 });
    await page.getByLabel(/Related System/).selectOption({ index: 1 });
    await page.getByLabel(/Requested Priority/).selectOption("HIGH");
    await page.getByLabel(/^Summary/).fill(`Visual QA ticket ${Date.now()}`);
    await page.getByLabel(/^Description/).fill("Created for responsive/visual QA screenshots (Issue 6).");
    await page.getByRole("button", { name: /create ticket/i }).click();

    // Read the ticket number off the success confirmation, before navigating to My Tickets —
    // by then dozens of prior test-run tickets are on the page too, making the text ambiguous.
    const ticketNumber = await page.getByText(/^TKT-\d{4}-\d{6}$/).textContent();
    await page.goto(`/tickets/${ticketNumber}`);

    await assertNoHorizontalScroll(page);
    await assertFieldRowLayout(page, ["Ticket No.", "Ticket Date", "Requester"], testInfo.project.name);
    await page.screenshot({
      path: `../artifacts/lab-02/screenshots/ticket-detail/${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
});

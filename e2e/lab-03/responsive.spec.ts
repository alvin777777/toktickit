import { test, expect, Page } from "@playwright/test";
import { ACCOUNTS, createTicketAsRequester, loginExpectingHome, openNav } from "./helpers.js";

// RESP-01 (AC-32) — desktop/tablet/mobile screenshots for Login, Ticket Queue, IT Staff Ticket
// Detail, and User Management, plus automated no-horizontal-scroll and layout-breakpoint
// assertions (ui-spec.md §10). Runs once per Playwright project (see playwright.config.ts).

async function assertNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
}

// Three same-row fields: one row on desktop, 2 + 1 on tablet, stacked on mobile.
async function assertFieldRowLayout(page: Page, labels: string[], projectName: string) {
  const boxes = await Promise.all(labels.map((label) => page.getByLabel(label, { exact: true }).boundingBox()));
  const [first, second, third] = boxes.map((box) => box!.y);
  if (projectName === "desktop") {
    expect(third).toBeCloseTo(first, 0);
  } else if (projectName === "tablet") {
    expect(second).toBeCloseTo(first, 0);
    expect(third).toBeGreaterThan(first + 10);
  } else {
    expect(second).toBeGreaterThan(first + 10);
    expect(third).toBeGreaterThan(second + 10);
  }
}

function shot(group: string, projectName: string) {
  return `../artifacts/lab-03/screenshots/${group}/${projectName}.png`;
}

test.describe("Responsive / visual QA (Lab 3)", () => {
  test("Login and Change Password — no horizontal scroll", async ({ page }, testInfo) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: shot("authentication", testInfo.project.name), fullPage: true });

    await loginExpectingHome(page, ACCOUNTS.requester, /\/tickets$/);
    await openNav(page);
    await page.getByRole("link", { name: /change password/i }).click();
    await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: `../artifacts/lab-03/screenshots/authentication/change-password-${testInfo.project.name}.png`, fullPage: true });
  });

  test("Ticket Queue — table at desktop, cards below lg, filters usable, no horizontal scroll", async ({ page }, testInfo) => {
    await loginExpectingHome(page, ACCOUNTS.staff, /\/staff\/queue$/);
    await expect(page.getByTestId("queue-counts")).toBeVisible();
    await assertNoHorizontalScroll(page);
    if (testInfo.project.name === "desktop") {
      await expect(page.getByTestId("queue-table")).toBeVisible();
      await expect(page.getByTestId("queue-cards")).toBeHidden();
    } else {
      await expect(page.getByTestId("queue-table")).toBeHidden();
      await expect(page.getByTestId("queue-cards")).toBeVisible();
    }
    await page.screenshot({ path: shot("staff-queue", testInfo.project.name), fullPage: true });
  });

  test("IT Staff Ticket Detail — 3/2/1 columns, tabs reachable, no horizontal scroll", async ({ page, browser }, testInfo) => {
    // A fresh ticket so the page has a predictable state at every width.
    const requesterPage = await browser.newPage();
    await loginExpectingHome(requesterPage, ACCOUNTS.requester, /\/tickets$/);
    const ticketNumber = await createTicketAsRequester(requesterPage, `Visual QA ${testInfo.project.name} ${Date.now()}`);
    await requesterPage.close();

    await loginExpectingHome(page, ACCOUNTS.staff, /\/staff\/queue$/);
    await page.goto(`/staff/tickets/${ticketNumber}`);
    await expect(page.getByTestId("owner-name")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await assertFieldRowLayout(page, ["Ticket No.", "Category", "Related System"], testInfo.project.name);
    await page.getByRole("tab", { name: /internal notes/i }).click();
    await expect(page.getByTestId("internal-notes")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: shot("staff-ticket-detail", testInfo.project.name), fullPage: true });
  });

  test("User Management — table at desktop, cards below lg, panel fits, no horizontal scroll", async ({ page }, testInfo) => {
    await loginExpectingHome(page, ACCOUNTS.admin, /\/admin\/users$/);
    await expect(page.getByRole("button", { name: /create user/i })).toBeVisible();
    if (testInfo.project.name === "desktop") {
      await expect(page.getByTestId("users-table")).toBeVisible();
      await expect(page.getByTestId("users-cards")).toBeHidden();
    } else {
      await expect(page.getByTestId("users-table")).toBeHidden();
      await expect(page.getByTestId("users-cards")).toBeVisible();
    }
    await assertNoHorizontalScroll(page);
    await page.getByRole("button", { name: /create user/i }).click();
    await expect(page.getByTestId("user-panel")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: shot("user-management", testInfo.project.name), fullPage: true });
  });
});

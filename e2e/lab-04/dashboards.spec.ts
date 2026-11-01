import { test, expect } from "@playwright/test";
import { ACCOUNTS, signIn } from "./helpers.js";

// E2E-03 (AC-19, AC-22) — a dashboard card and the list it opens show the same number.
test.describe("Dashboards", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "flow test — responsive coverage lives in responsive.spec.ts");
  });

  test("Requester: card count equals the filtered My Tickets total", async ({ page }) => {
    await signIn(page, ACCOUNTS.requester);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome, Jennifer!");
    const card = page.getByRole("link", { name: /^My Open Tickets: \d+/ });
    const value = Number((await card.getAttribute("aria-label"))!.match(/: (\d+)\./)![1]);
    await card.click();
    await expect(page).toHaveURL(/\/tickets\?statusGroup=active$/);
    await expect(page.getByTestId("drilldown-chips")).toContainText("Showing: Open tickets");
    await expect(page.getByText(new RegExp(`of ${value} tickets?`))).toBeVisible();
  });

  test("IT Staff: Unassigned card count equals the filtered Ticket Queue total; list rows open Ticket Detail", async ({ page }) => {
    await signIn(page, ACCOUNTS.staff);
    const card = page.getByRole("link", { name: /^Unassigned: \d+/ });
    const value = Number((await card.getAttribute("aria-label"))!.match(/: (\d+)\./)![1]);
    await card.click();
    await expect(page).toHaveURL(/\/staff\/queue\?statusGroup=active&owner=unassigned$/);
    await expect(page.getByText(new RegExp(`of ${value} tickets?`))).toBeVisible();

    await page.goto("/dashboard");
    const firstUpdated = page.getByRole("region", { name: "Recently updated" }).getByRole("link").filter({ hasText: /^TKT-/ }).first();
    const tn = await firstUpdated.textContent();
    await firstUpdated.click();
    await expect(page).toHaveURL(new RegExp(`/staff/tickets/${tn}$`));
  });

  test("Administrator sees user-account counts linking to User Management; IT Staff does not", async ({ page, browser }) => {
    await signIn(page, ACCOUNTS.admin);
    await page.getByTestId("user-counts").click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    const staff = await browser.newPage();
    await signIn(staff, ACCOUNTS.staff);
    await expect(staff.getByTestId("user-counts")).toHaveCount(0);
    await staff.close();
  });

  // A11Y-01 (AC-29) — keyboard only: Tab reaches a metric card with a visible focus ring; Enter opens it.
  test("keyboard: metric cards are focusable with a visible ring and open with Enter", async ({ page }) => {
    await signIn(page, ACCOUNTS.staff);
    const firstCard = page.getByTestId("metric-card").first();
    for (let i = 0; i < 25 && !(await firstCard.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(firstCard).toBeFocused();
    const outline = await firstCard.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, shadow: s.boxShadow };
    });
    expect(outline.outline !== "none" || outline.shadow !== "none").toBeTruthy();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/staff\/queue\?status=NEW$/);
  });

  test("keyboard: the action form is operable without a mouse", async ({ page }) => {
    await signIn(page, ACCOUNTS.staff);
    await page.goto("/staff/tickets/TKT-2026-000002?tab=actions"); // seeded VPN ticket (OPEN, has an open action)
    await page.getByRole("button", { name: "+ Add Action" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Action Date/Time")).toBeVisible();
    const order: string[] = [];
    await page.getByLabel("Action Date/Time").focus();
    // Chromium's datetime-local has internal sub-fields (day, month, year, time) that Tab walks
    // through inside the one control, so record each control once, in the order it is reached.
    for (let i = 0; i < 20 && order.length < 6; i++) {
      const id = await page.evaluate(() => (document.activeElement as HTMLElement).id || document.activeElement!.textContent!.trim());
      if (order.at(-1) !== id) order.push(id);
      await page.keyboard.press("Tab");
    }
    expect(order.slice(0, 6)).toEqual([
      "new-action-actionAt", "new-action-status", "new-action-performedById", "new-action-description", "new-action-result", "new-action-followUpRequired",
    ]);
  });
});

import { test, expect } from "@playwright/test";
import { ACCOUNTS, assertNoHorizontalScroll, shot, signIn } from "./helpers.js";

// RESP-01 (AC-28) — desktop / tablet / mobile screenshots of every major Lab 4 screen plus the
// automated no-horizontal-scroll check (ui-spec.md §9). Runs once per Playwright project.
test.describe("Responsive / visual QA (Lab 4)", () => {
  test("Requester Dashboard", async ({ page }, testInfo) => {
    await signIn(page, ACCOUNTS.requester);
    await expect(page.getByRole("region", { name: "Needs your attention" })).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: shot("requester-dashboard", testInfo.project.name), fullPage: true });
  });

  test("IT Staff Dashboard and Administrator Dashboard", async ({ page, browser }, testInfo) => {
    await signIn(page, ACCOUNTS.staff);
    await expect(page.getByRole("region", { name: "My Open Actions" })).toBeVisible();
    await assertNoHorizontalScroll(page);
    // 8+1 cards: two per row on phones, more on wider screens (ui-spec.md §9)
    const cards = page.getByTestId("metric-card");
    const [a, b, c] = await Promise.all([0, 1, 2].map((i) => cards.nth(i).boundingBox()));
    expect(b!.y).toBeCloseTo(a!.y, 0);
    if (testInfo.project.name === "mobile") expect(c!.y).toBeGreaterThan(a!.y + 10);
    else expect(c!.y).toBeCloseTo(a!.y, 0);
    await page.screenshot({ path: shot("staff-dashboard", testInfo.project.name), fullPage: true });

    const admin = await browser.newPage({ viewport: page.viewportSize()! });
    await signIn(admin, ACCOUNTS.admin);
    await expect(admin.getByTestId("user-counts")).toBeVisible();
    await assertNoHorizontalScroll(admin);
    await admin.screenshot({ path: shot("staff-dashboard", `admin-${testInfo.project.name}`), fullPage: true });
    await admin.close();
  });

  test("Actions Taken list, form with validation, and requester view", async ({ page, browser }, testInfo) => {
    await signIn(page, ACCOUNTS.staff);
    await page.goto("/staff/tickets/TKT-2026-000001?tab=actions"); // seeded: 3 actions, follow-up, planned step
    await expect(page.getByTestId("actions-taken").getByRole("listitem")).toHaveCount(3);
    await assertNoHorizontalScroll(page);
    await page.screenshot({ path: shot("actions-taken", testInfo.project.name), fullPage: true });

    await page.getByRole("button", { name: "+ Add Action" }).click();
    await page.getByLabel("Follow-Up Required?").check();
    await page.getByRole("button", { name: "Save Action" }).click();
    await expect(page.getByText("Description must be 5-1000 characters.")).toBeVisible();
    await assertNoHorizontalScroll(page);
    await page.getByRole("form", { name: "New action" }).screenshot({ path: shot("actions-taken", `form-${testInfo.project.name}`) });

    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByTestId("status-history")).toBeVisible();
    await assertNoHorizontalScroll(page);

    const requester = await browser.newPage({ viewport: page.viewportSize()! });
    await signIn(requester, ACCOUNTS.requester);
    await requester.goto("/tickets/TKT-2026-000001");
    await expect(requester.getByRole("region", { name: "Actions Taken" }).getByRole("listitem")).toHaveCount(3);
    await assertNoHorizontalScroll(requester);
    await requester.screenshot({ path: shot("actions-taken", `requester-${testInfo.project.name}`), fullPage: true });
    await requester.close();
  });
});

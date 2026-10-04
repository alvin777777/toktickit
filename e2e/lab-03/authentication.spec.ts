import { test, expect } from "@playwright/test";
import { ACCOUNTS, createUserViaApi, login, loginExpectingHome, openNav } from "./helpers.js";

// E2E-01 (AC-01, AC-05, AC-07) and E2E-02 (AC-02) — docs/lab-03/tests.md.
// Requires both dev servers and the seeded DB (README.md §4–§7).

test.describe("Authentication", () => {
  test("invalid then valid login, role shell, logout, and protected route after logout", async ({ page }) => {
    await login(page, ACCOUNTS.requester, "WrongPassword1");
    await expect(page.getByRole("alert")).toHaveText(/invalid email or password/i);
    await expect(page).toHaveURL(/\/login$/);

    await loginExpectingHome(page, ACCOUNTS.requester, /\/tickets$/);
    await openNav(page);
    const shellUser = page.getByTestId("current-user");
    await expect(shellUser).toContainText("Jennifer Anderson");
    await expect(shellUser).toContainText("Requester");
    await expect(page.getByRole("link", { name: "My Tickets" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ticket Queue" })).toHaveCount(0);

    await page.getByRole("button", { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/); // AC-07 — direct access blocked after logout
  });

  test("inactive account gets the explicit inactive message", async ({ page }) => {
    await login(page, "former.employee@toktickit.dev");
    await expect(page.getByRole("alert")).toHaveText(/this account is inactive/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("first login forces a password change before the application opens", async ({ page, request }) => {
    const email = `e2e.firstlogin.${Date.now()}@toktickit.dev`;
    await createUserViaApi(request, { name: "E2E First Login", email, role: "REQUESTER", initialPassword: "Welcome123!" });

    await login(page, email, "Welcome123!");
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText(/you must change your password to continue/i)).toBeVisible();

    // Normal screens stay unavailable while the change is pending (AC-02).
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByRole("link", { name: "My Tickets" })).toHaveCount(0);

    await page.getByLabel(/current \(initial\) password/i).fill("Welcome123!");
    await page.getByLabel(/^new password/i).fill("weak");
    await page.getByLabel(/confirm new password/i).fill("weak");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText(/must be 8-72 characters/i)).toBeVisible();

    await page.getByLabel(/^new password/i).fill("Stronger123");
    await page.getByLabel(/confirm new password/i).fill("Stronger123");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page).toHaveURL(/\/tickets$/);
    await openNav(page);
    await expect(page.getByRole("link", { name: "My Tickets" })).toBeVisible();

    // The new password works and the old initial one no longer does.
    await page.getByRole("button", { name: /logout/i }).click();
    await login(page, email, "Welcome123!");
    await expect(page.getByRole("alert")).toHaveText(/invalid email or password/i);
    await loginExpectingHome(page, email, /\/tickets$/, "Stronger123");
  });
});

import { test, expect } from "@playwright/test";
import { ACCOUNTS, login, loginExpectingHome } from "./helpers.js";

// E2E-05 (AC-22..AC-28) — docs/lab-03/tests.md.

test.describe("User administration", () => {
  test("admin creates a user with an initial password, the user is forced to change it, admin edits the role, self-deactivation is locked", async ({
    page,
    browser,
  }) => {
    const email = `e2e.admin.${Date.now()}@toktickit.dev`;
    await loginExpectingHome(page, ACCOUNTS.admin, /\/admin\/users$/);
    await expect(page.getByTestId("current-user")).toContainText("Administrator");

    // Create (AC-23)
    await page.getByRole("button", { name: /create user/i }).click();
    const panel = page.getByTestId("user-panel");
    await panel.getByLabel(/full name/i).fill("E2E Created User");
    await panel.getByLabel(/email address/i).fill(email);
    await panel.getByLabel(/^role/i).selectOption("IT_STAFF");
    await panel.getByLabel(/initial password/i).fill("Welcome123!");
    await panel.getByRole("button", { name: /save user/i }).click();
    await expect(page.getByRole("status")).toContainText(/created/i);
    await page.getByLabel(/search users/i).fill(email);
    await expect(page.getByText(email).and(page.locator(":visible"))).toBeVisible();

    // Duplicate email is refused on the field (AC-24)
    await page.getByRole("button", { name: /create user/i }).click();
    await panel.getByLabel(/full name/i).fill("Duplicate Person");
    await panel.getByLabel(/email address/i).fill(email.toUpperCase());
    await panel.getByLabel(/initial password/i).fill("Welcome123!");
    await panel.getByRole("button", { name: /save user/i }).click();
    await expect(panel.getByText(/already exists/i)).toBeVisible();
    await panel.getByRole("button", { name: /cancel/i }).click();

    // The new user must change the initial password at first login (AC-02/AC-23)
    const userPage = await browser.newPage();
    await login(userPage, email, "Welcome123!");
    await expect(userPage).toHaveURL(/\/change-password$/);
    await userPage.getByLabel(/current \(initial\) password/i).fill("Welcome123!");
    await userPage.getByLabel(/^new password/i).fill("Stronger123");
    await userPage.getByLabel(/confirm new password/i).fill("Stronger123");
    await userPage.getByRole("button", { name: /continue/i }).click();
    await expect(userPage).toHaveURL(/\/staff\/queue$/); // IT Staff home
    await userPage.close();

    // Edit role (AC-25)
    await page.getByRole("button", { name: /edit e2e created user/i }).click();
    await panel.getByLabel(/^role/i).selectOption("REQUESTER");
    await panel.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved/i);
    await expect(page.getByTestId("users-table")).toContainText("Requester"); // present in the DOM at every width

    // Self-deactivation is locked in the UI (AC-27) and refused by the API (covered in API-32)
    await page.getByLabel(/search users/i).fill("john.smith");
    await page.getByRole("button", { name: /edit john smith/i }).click();
    await expect(panel.getByLabel(/active/i)).toBeDisabled();
    await expect(panel.getByText(/you cannot deactivate your own account/i)).toBeVisible();
  });

  test("IT Staff cannot open User Management", async ({ page }) => {
    await loginExpectingHome(page, ACCOUNTS.staff, /\/staff\/queue$/);
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
    await page.goto("/admin/users");
    await expect(page.getByTestId("forbidden")).toBeVisible();
  });
});

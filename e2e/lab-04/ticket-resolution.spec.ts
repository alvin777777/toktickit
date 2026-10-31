import { test, expect } from "@playwright/test";
import { ACCOUNTS, addAction, newTicketForStaff, signIn } from "./helpers.js";

// E2E-02 (AC-11, AC-12, AC-14, AC-17) — Resolved is not offered until the recorded work allows it;
// then resolve, check the header and History, and the Requester sees the outcome.
test("resolution gate, resolve, history, requester view", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow test — responsive coverage lives in responsive.spec.ts");
  const ticketNumber = await newTicketForStaff(page, `E2E resolve ${Date.now()}`);

  const staff = await browser.newPage();
  await signIn(staff, ACCOUNTS.staff);
  await staff.goto(`/staff/tickets/${ticketNumber}`);
  await staff.getByRole("button", { name: /^claim$/i }).click();
  await staff.getByLabel("Status", { exact: true }).selectOption("IN_PROGRESS");
  await staff.getByRole("button", { name: "Update Status" }).click();
  await expect(staff.getByRole("heading", { level: 1 })).toContainText("In Progress");

  // Blocked: no Resolved option, checklist explains (AC-17)
  const status = staff.locator("#sd-status");
  await expect(status.getByRole("option", { name: "Resolved" })).toHaveCount(0);
  const checklist = staff.getByTestId("resolve-checklist");
  await expect(checklist).toContainText("At least one action is completed (missing)");

  // A completed action that needs follow-up still blocks (BR-20d)
  await addAction(staff, { description: "Reset the VPN profile", result: "Works on Wi-Fi only", followUp: "Check on the mobile hotspot tomorrow" });
  await expect(checklist).toContainText("The latest completed action needs no follow-up (missing)");
  await expect(status.getByRole("option", { name: "Resolved" })).toHaveCount(0);

  // The follow-up is done → the gate opens
  await addAction(staff, { description: "Tested VPN on the mobile hotspot", result: "Connects on both networks" });
  await expect(checklist).toHaveCount(0);
  await status.selectOption("RESOLVED");
  await staff.getByRole("button", { name: "Update Status" }).click();
  await expect(staff.getByRole("heading", { level: 1 })).toContainText("Resolved"); // summary refreshes (AC-12)

  // History lists every change once, oldest first (AC-14)
  await staff.getByRole("tab", { name: "History" }).click();
  const history = staff.getByTestId("status-history").getByRole("listitem");
  await expect(history).toHaveCount(4);
  await expect(history.nth(0)).toContainText("Created as");
  await expect(history.nth(1)).toContainText(/New.*Open.*Emily Davis/);
  await expect(history.nth(3)).toContainText(/In Progress.*Resolved.*Emily Davis/);
  // Resolved tickets take no more work (BR-10)
  await staff.getByRole("tab", { name: /actions taken/i }).click();
  await expect(staff.getByText("Reopen the ticket to record more actions.")).toBeVisible();
  await expect(staff.getByRole("button", { name: "+ Add Action" })).toHaveCount(0);
  await staff.close();

  // Requester sees Resolved and the same history
  await page.goto(`/tickets/${ticketNumber}`);
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  const reqHistory = page.getByRole("region", { name: "Status history" }).getByRole("listitem");
  await expect(reqHistory).toHaveCount(4);
});

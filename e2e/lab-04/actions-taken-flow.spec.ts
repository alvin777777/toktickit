import { test, expect } from "@playwright/test";
import { ACCOUNTS, STAFF_B, addAction, newTicketForStaff, signIn } from "./helpers.js";

// E2E-01 (AC-01, AC-02, AC-05, AC-08) — two IT Staff members record, edit, start, and complete
// Actions Taken on one Ticket; the Requester sees all of them read-only.
test("Actions Taken: plan, edit, start, complete by two staff; requester sees them read-only", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow test — responsive coverage lives in responsive.spec.ts");
  const ticketNumber = await newTicketForStaff(page, `E2E actions ${Date.now()}`);

  // Staff A (Emily) claims and plans the work
  const emily = await browser.newPage();
  await signIn(emily, ACCOUNTS.staff);
  await emily.goto(`/staff/tickets/${ticketNumber}`);
  await emily.getByRole("button", { name: /^claim$/i }).click();
  await expect(emily.getByTestId("owner-name")).toHaveText("Emily Davis");
  await expect(emily.getByText("No actions recorded yet.")).toBeVisible();

  // Validation: Follow-up Note is required when follow-up is needed (AC-04)
  await emily.getByRole("button", { name: "+ Add Action" }).click();
  const form = emily.getByRole("form", { name: "New action" });
  await form.getByLabel("Action Description").fill("Run diagnostics on the laptop");
  await form.getByLabel("Status").selectOption("PLANNED");
  await emily.getByLabel("Follow-Up Required?").check();
  await emily.getByRole("button", { name: "Save Action" }).click();
  await expect(emily.getByText("Follow-up note is required when follow-up is needed.")).toBeVisible();
  await emily.getByLabel("Follow-Up Required?").uncheck();
  await emily.getByRole("button", { name: "Save Action" }).click();
  await expect(emily.getByText("Action saved.")).toBeVisible();
  const planned = emily.getByTestId("actions-taken").getByRole("listitem").filter({ hasText: "Run diagnostics on the laptop" });
  await expect(planned.getByTestId("action-status")).toHaveText("Planned");

  // Edit → Start → Complete (AC-05)
  await planned.getByRole("button", { name: /edit action from/i }).click();
  await emily.getByLabel("Action Description").fill("Run hardware diagnostics on the laptop");
  await emily.getByRole("button", { name: "Save Changes" }).click();
  await expect(emily.getByText("Action updated.")).toBeVisible();
  const edited = emily.getByTestId("actions-taken").getByRole("listitem").filter({ hasText: "Run hardware diagnostics" });
  await edited.getByRole("button", { name: /edit action from/i }).click();
  await emily.getByRole("button", { name: "Start" }).click();
  await expect(edited.getByTestId("action-status")).toHaveText("In Progress");
  await edited.getByRole("button", { name: /edit action from/i }).click();
  await emily.getByLabel(/^Result/).fill("Battery cell 2 failing; other hardware OK.");
  await emily.getByRole("button", { name: "Complete" }).click();
  await expect(emily.getByText("Action completed.")).toBeVisible();
  await expect(edited.getByTestId("action-status")).toHaveText("Completed");
  await expect(edited.getByRole("button", { name: /edit/i })).toHaveCount(0); // final (BR-09)
  await emily.close();

  // Staff B (Kevin) records another action on the same Ticket, which Emily still owns (AC-02, BR-02)
  const kevin = await browser.newPage();
  await signIn(kevin, STAFF_B);
  await kevin.goto(`/staff/tickets/${ticketNumber}`);
  await addAction(kevin, { description: "Ordered a replacement battery", result: "Order #4471 placed", attachmentNotes: "see order-4471.pdf" });
  await expect(kevin.getByTestId("owner-name")).toHaveText("Emily Davis");
  await expect(kevin.getByRole("tab", { name: "Actions Taken (2)" })).toBeVisible();
  const rows = kevin.getByTestId("actions-taken").getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Emily Davis");
  await expect(rows.nth(1)).toContainText("Kevin Patel");
  await kevin.close();

  // The Requester sees both actions, read-only (AC-08)
  await page.goto(`/tickets/${ticketNumber}`);
  const section = page.getByRole("region", { name: "Actions Taken" });
  await expect(section.getByRole("listitem")).toHaveCount(2);
  await expect(section).toContainText("Battery cell 2 failing");
  await expect(section).toContainText("see order-4471.pdf");
  await expect(section.getByRole("button")).toHaveCount(0);
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionsTaken from "../../src/components/ActionsTaken.js";
import { ACTION_STATUS_BADGE, ACTION_STATUS_LABEL, ActionStatusBadge } from "../../src/components/badges.js";
import * as api from "../../src/api.js";

function action(overrides: Partial<api.ActionTaken> = {}): api.ActionTaken {
  return {
    id: 1,
    ticketId: 1,
    actionAt: "2026-10-30T03:15:00.000Z",
    description: "Updated the dock firmware.",
    result: "Dock detected after sleep.",
    status: "COMPLETED",
    performedBy: { id: 8, name: "Kevin Patel", role: "IT_STAFF" },
    createdBy: { id: 7, name: "Emily Davis", role: "IT_STAFF" },
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 1,
    createdAt: "2026-10-30T03:20:00.000Z",
    updatedAt: "2026-10-30T03:20:00.000Z",
    completedAt: "2026-10-30T03:20:00.000Z",
    cancelledAt: null,
    ...overrides,
  };
}

const ASSIGNEES: api.Assignee[] = [
  { id: 7, name: "Emily Davis", role: "IT_STAFF" },
  { id: 8, name: "Kevin Patel", role: "IT_STAFF" },
];

function renderStaff(list: api.ActionTaken[], extra: Partial<Parameters<typeof ActionsTaken>[0]> = {}) {
  const create = vi.fn();
  const update = vi.fn();
  const onChanged = vi.fn();
  render(
    <ActionsTaken
      load={() => Promise.resolve(list)}
      assignees={ASSIGNEES}
      currentUserId={7}
      create={create}
      update={update}
      onChanged={onChanged}
      {...extra}
    />
  );
  return { create, update, onChanged };
}

afterEach(() => vi.restoreAllMocks());

// UI-05 (FR-01, FR-05, AC-08)
describe("Actions Taken list", () => {
  it("shows every field, the follow-up badge, attachment notes, and who recorded it", async () => {
    renderStaff([
      action(),
      action({ id: 2, status: "PLANNED", result: null, followUpRequired: true, followUpNote: "Order a battery", attachmentNotes: "see battery.pdf", performedBy: { id: 7, name: "Emily Davis", role: "IT_STAFF" } }),
    ]);
    const first = await screen.findByTestId("action-1");
    expect(first).toHaveTextContent("Updated the dock firmware.");
    expect(first).toHaveTextContent("Dock detected after sleep.");
    expect(first).toHaveTextContent("Kevin Patel");
    expect(first).toHaveTextContent("recorded by Emily Davis");
    expect(within(first).queryByRole("button", { name: /edit/i })).not.toBeInTheDocument(); // completed = final

    const second = screen.getByTestId("action-2");
    expect(second).toHaveTextContent("Follow-up needed");
    expect(second).toHaveTextContent("Order a battery");
    expect(second).toHaveTextContent("Attachment notes: see battery.pdf");
    expect(second).not.toHaveTextContent("recorded by");
    expect(within(second).getByRole("button", { name: /edit action from/i })).toBeInTheDocument();
  });

  it("shows the empty state, and no add/edit controls when read-only or not workable", async () => {
    render(<ActionsTaken readOnly load={() => Promise.resolve([action({ status: "PLANNED" })])} />);
    expect(await screen.findByTestId("action-1")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    renderStaff([], { workable: false });
    expect(await screen.findByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("Reopen the ticket to record more actions.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add action/i })).not.toBeInTheDocument();
  });

  it("offers Retry when the list fails to load", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce([action()]);
    const user = userEvent.setup();
    render(<ActionsTaken readOnly load={load} />);
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByTestId("action-1")).toBeInTheDocument();
  });
});

// UI-06 (AC-04, AC-07)
describe("create mode", () => {
  it("validates under each field, requires the follow-up note only when checked, and defaults the performer to me", async () => {
    const { create } = renderStaff([]);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add Action" }));
    expect(screen.getByLabelText("Performed by")).toHaveValue("7");
    expect(screen.queryByLabelText(/Follow-up Note/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Action Description"), "abc");
    await user.click(screen.getByLabelText("Follow-Up Required?"));
    expect(screen.getByLabelText(/Follow-up Note/)).toBeRequired();
    await user.click(screen.getByRole("button", { name: "Save Action" }));

    expect(screen.getByLabelText("Action Description")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Description must be 5-1000 characters.")).toBeInTheDocument();
    expect(screen.getByText("Result is required to complete an action.")).toBeInTheDocument();
    expect(screen.getByText("Follow-up note is required when follow-up is needed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Action Description")).toHaveFocus();
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps entries after a network failure and retries with the same clientRequestId", async () => {
    const { create, onChanged } = renderStaff([]);
    create.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(action({ id: 9, description: "Reset the VPN profile" }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add Action" }));
    await user.type(screen.getByLabelText("Action Description"), "Reset the VPN profile");
    await user.type(screen.getByLabelText(/^Result/), "Connected");
    await user.selectOptions(screen.getByLabelText("Performed by"), "8");
    await user.click(screen.getByRole("button", { name: "Save Action" }));

    expect(await screen.findByText(/Your entries are kept/)).toBeInTheDocument();
    expect(screen.getByLabelText("Action Description")).toHaveValue("Reset the VPN profile");
    await user.click(screen.getByRole("button", { name: "Save Action" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const [first, second] = create.mock.calls.map((c) => c[0]);
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(first).toMatchObject({ description: "Reset the VPN profile", result: "Connected", performedById: 8, status: "COMPLETED", followUpNote: null });
    expect(await screen.findByTestId("action-9")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("disables Save while the request is in flight (no double submit)", async () => {
    const { create } = renderStaff([]);
    let resolve: (a: api.ActionTaken) => void = () => {};
    create.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add Action" }));
    await user.type(screen.getByLabelText("Action Description"), "Reset the VPN profile");
    await user.type(screen.getByLabelText(/^Result/), "Connected");
    await user.click(screen.getByRole("button", { name: "Save Action" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving…" }));
    expect(create).toHaveBeenCalledTimes(1);
    resolve(action({ id: 5 }));
    expect(await screen.findByTestId("action-5")).toBeInTheDocument();
  });

  it("maps the server's 400 field messages to the same places", async () => {
    const { create } = renderStaff([]);
    create.mockRejectedValue(new api.ApiError(400, { error: "Invalid action", fields: { performedById: "Select an active IT Staff or Administrator." } }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "+ Add Action" }));
    await user.type(screen.getByLabelText("Action Description"), "Reset the VPN profile");
    await user.type(screen.getByLabelText(/^Result/), "Connected");
    await user.click(screen.getByRole("button", { name: "Save Action" }));
    expect(await screen.findByText("Select an active IT Staff or Administrator.")).toBeInTheDocument();
    expect(screen.getByLabelText("Performed by")).toHaveClass("is-invalid");
  });
});

// UI-07 (AC-05, AC-06)
describe("edit mode", () => {
  const planned = action({ id: 3, status: "PLANNED", result: null, version: 2, performedBy: { id: 7, name: "Emily Davis", role: "IT_STAFF" }, createdBy: { id: 7, name: "Emily Davis", role: "IT_STAFF" } });

  it("starts, then completes (result required) with the edited version", async () => {
    const { update } = renderStaff([planned]);
    update.mockResolvedValueOnce({ ...planned, status: "IN_PROGRESS", version: 3 });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /edit action from/i }));
    await user.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(3, expect.objectContaining({ status: "IN_PROGRESS", version: 2 })));
    expect(await screen.findByText("Action updated.")).toBeInTheDocument();
    expect(within(screen.getByTestId("action-3")).getByTestId("action-status")).toHaveTextContent("In Progress");

    await user.click(screen.getByRole("button", { name: /edit action from/i }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(screen.getByText("Result is required to complete an action.")).toBeInTheDocument();
    update.mockResolvedValueOnce({ ...planned, status: "COMPLETED", result: "Replaced", version: 4 });
    await user.type(screen.getByLabelText(/^Result/), "Replaced");
    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith(3, expect.objectContaining({ status: "COMPLETED", result: "Replaced", version: 3 })));
    expect(await screen.findByText("Action completed.")).toBeInTheDocument();
  });

  it("asks before cancelling an action", async () => {
    const { update } = renderStaff([planned]);
    update.mockResolvedValue({ ...planned, status: "CANCELLED", version: 3 });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /edit action from/i }));
    await user.click(screen.getByRole("button", { name: "Cancel Action" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Cancel this action?");
    await user.click(screen.getByRole("button", { name: "Yes, cancel the action" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(3, { version: 2, status: "CANCELLED" }));
    expect(await screen.findByText("Action cancelled.")).toBeInTheDocument();
  });

  it("on STALE_UPDATE keeps the draft, explains, and loads the latest values on request", async () => {
    const { update } = renderStaff([planned]);
    const latest = { ...planned, description: "Kevin's newer description", performedBy: ASSIGNEES[1], version: 3 };
    update.mockRejectedValue(new api.ApiError(409, { error: "This action was changed by someone else.", code: "STALE_UPDATE", current: latest }));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /edit action from/i }));
    const description = screen.getByLabelText("Action Description");
    await user.clear(description);
    await user.type(description, "My own edit");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText(/Someone else changed this action while you were editing/)).toBeInTheDocument();
    expect(screen.getByLabelText("Action Description")).toHaveValue("My own edit");
    await user.click(screen.getByRole("button", { name: "Use latest" }));
    expect(screen.getByLabelText("Action Description")).toHaveValue("Kevin's newer description");
    expect(screen.getByLabelText("Performed by")).toHaveValue("8");
  });
});

// STYLE-01 (AC-29, ui-spec §1.1)
describe("action status badges", () => {
  it("use one class map and always carry text", () => {
    expect(ACTION_STATUS_BADGE).toEqual({
      PLANNED: "bg-light text-dark border",
      IN_PROGRESS: "text-white",
      COMPLETED: "bg-success",
      CANCELLED: "bg-secondary",
    });
    for (const status of Object.keys(ACTION_STATUS_LABEL) as api.ActionStatus[]) {
      const { unmount } = render(<ActionStatusBadge status={status} />);
      expect(screen.getByTestId("action-status")).toHaveTextContent(ACTION_STATUS_LABEL[status]);
      unmount();
    }
  });
});

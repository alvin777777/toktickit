import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CreateTicket from "../../src/pages/CreateTicket.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

const REQUESTER = { id: 1, name: "Jennifer Anderson", email: "jennifer@toktickit.dev" };

function renderCreateTicket() {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(REQUESTER));
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <CreateTicket />
      </RequesterProvider>
    </MemoryRouter>
  );
}

function mockRefData() {
  vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
  vi.spyOn(api, "getRelatedSystems").mockResolvedValue([{ id: 1, name: "Corporate Laptop" }]);
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Hardware" });
  await user.selectOptions(screen.getByLabelText(/Category/i), "1");
  await user.selectOptions(screen.getByLabelText(/Related System/i), "1");
  await user.selectOptions(screen.getByLabelText(/Requested Priority/i), "MEDIUM");
  await user.type(screen.getByLabelText(/Summary/i), "Laptop battery drains quickly");
  await user.type(screen.getByLabelText(/Description/i), "Battery drains much faster than usual.");
}

describe("CreateTicket", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // UI-05 (AC-04)
  it("shows a validation message and makes no API call when Summary is empty", async () => {
    mockRefData();
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderCreateTicket();

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/Summary/i));
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    expect(await screen.findByText(/summary is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-06 (AC-05)
  it("shows a validation message and makes no API call when Description is empty", async () => {
    mockRefData();
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderCreateTicket();

    await fillValidForm(user);
    await user.clear(screen.getByLabelText(/Description/i));
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    expect(await screen.findByText(/description is required/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-07 (AC-07) — rejected client-side before any upload is attempted.
  it("rejects an oversized attachment before any API call", async () => {
    mockRefData();
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderCreateTicket();
    await screen.findByRole("option", { name: "Hardware" });

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], "too-big.png", { type: "image/png" });
    const input = screen.getByLabelText(/Attachments/i) as HTMLInputElement;
    await user.upload(input, bigFile);

    expect(await screen.findByText(/larger than 5 MB/i)).toBeInTheDocument();
    expect(screen.queryByText("too-big.png")).not.toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-08 (AC-08) — field values preserved on API failure.
  it("shows an error banner and preserves field values when the API call fails", async () => {
    mockRefData();
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderCreateTicket();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    await waitFor(() => {
      expect(screen.getByText(/unable to create ticket right now/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/Description/i)).toHaveValue("Battery drains much faster than usual.");
  });

  // UI-09 (AC-01) — success shows the generated Ticket Number.
  it("shows the generated Ticket Number on success", async () => {
    mockRefData();
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 1,
      ticketNumber: "TKT-2026-000001",
      attachments: [],
      attachmentErrors: [],
    });
    const user = userEvent.setup();
    renderCreateTicket();

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: /create ticket/i }));

    expect(await screen.findByText("TKT-2026-000001")).toBeInTheDocument();
  });
});

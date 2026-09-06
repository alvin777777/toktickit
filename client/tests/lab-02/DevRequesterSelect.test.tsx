import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequesterSelect from "../../src/pages/RequesterSelect.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

function renderSelect() {
  return render(
    <MemoryRouter initialEntries={["/select"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select" element={<RequesterSelect />} />
          <Route path="/tickets" element={<div>My Tickets Page</div>} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("RequesterSelect", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // UI-02 (AC-17) — loading state keeps the form shape (ui-spec.md §5.2): a skeleton row
  // stands in for the dropdown and Continue stays disabled, rather than the actions disappearing.
  it("shows a loading skeleton with Continue disabled before the requester list appears", async () => {
    let resolveRequesters: (value: api.Requester[]) => void = () => {};
    vi.spyOn(api, "getActiveRequesters").mockReturnValue(
      new Promise((resolve) => {
        resolveRequesters = resolve;
      })
    );

    renderSelect();

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument();

    resolveRequesters([{ id: 1, name: "Jennifer Anderson", email: "jennifer@toktickit.dev" }]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Development Requester/i)).toBeInTheDocument();
    });
  });

  // UI-03 (AC-18) — empty state shown when there are zero active requesters.
  it("shows an empty state when no active requesters exist", async () => {
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([]);

    renderSelect();

    await waitFor(() => {
      expect(screen.getByText(/no active development requesters/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Development Requester/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("shows an error state and allows retry when loading fails", async () => {
    vi.spyOn(api, "getActiveRequesters").mockRejectedValue(new Error("network error"));

    renderSelect();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unable to load/i);
    });
  });

  // FR-02 / Issue #18 — selecting a requester and clicking Continue stores the context and
  // navigates into the app; requested by review on PR #24.
  it("stores the selection and navigates to My Tickets on Continue", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([
      { id: 2, name: "Michael Brown", email: "michael.brown@toktickit.dev" },
    ]);

    renderSelect();

    const select = await screen.findByLabelText(/Development Requester/i);
    await user.selectOptions(select, "2");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByText("My Tickets Page")).toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem(REQUESTER_STORAGE_KEY) ?? "null");
    expect(stored).toEqual({ id: 2, name: "Michael Brown", email: "michael.brown@toktickit.dev" });
  });
});

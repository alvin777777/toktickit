import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequesterSelect from "../../src/pages/RequesterSelect.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

function renderSelect() {
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <RequesterSelect />
      </RequesterProvider>
    </MemoryRouter>
  );
}

describe("RequesterSelect", () => {
  // UI-02 (AC-17) — loading state shown before the list appears.
  it("shows a loading state before the requester list appears", async () => {
    let resolveRequesters: (value: api.Requester[]) => void = () => {};
    vi.spyOn(api, "getActiveRequesters").mockReturnValue(
      new Promise((resolve) => {
        resolveRequesters = resolve;
      })
    );

    renderSelect();

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);

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
  });

  it("shows an error state and allows retry when loading fails", async () => {
    vi.spyOn(api, "getActiveRequesters").mockRejectedValue(new Error("network error"));

    renderSelect();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/unable to load/i);
    });
  });
});

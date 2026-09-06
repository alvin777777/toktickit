import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AppShell from "../../src/components/AppShell.js";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/context/RequesterContext.js";

const SEEDED_REQUESTER = { id: 1, name: "Jennifer Anderson", email: "jennifer@toktickit.dev" };

function renderShellWithSelectedRequester() {
  localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(SEEDED_REQUESTER));

  return render(
    <MemoryRouter initialEntries={["/tickets"]}>
      <RequesterProvider>
        <Routes>
          <Route path="/select" element={<div>Requester Selection Page</div>} />
          <Route
            path="/tickets"
            element={
              <AppShell>
                <div>My Tickets Page</div>
              </AppShell>
            }
          />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

// UI-17 (AC-20) — Change Requester clears the context/localStorage and returns to /select,
// requested by review on PR #24.
describe("AppShell — Change Requester", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the current requester's name", () => {
    renderShellWithSelectedRequester();
    expect(screen.getByText("Jennifer Anderson")).toBeInTheDocument();
  });

  it("clears the context and navigates to /select when Change Requester is clicked", async () => {
    const user = userEvent.setup();
    renderShellWithSelectedRequester();

    await user.click(screen.getByRole("button", { name: /change requester/i }));

    expect(await screen.findByText("Requester Selection Page")).toBeInTheDocument();
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
  });
});

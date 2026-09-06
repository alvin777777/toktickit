import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RequireRequester from "../../src/components/RequireRequester.js";
import RequesterSelect from "../../src/pages/RequesterSelect.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

// UI-04 (AC-02 / BR-23) — opening a Requester-scoped route with no Requester selected
// redirects to the Development Requester Selection screen.
describe("RequireRequester", () => {
  it("redirects to /select when no Development Requester is selected", async () => {
    vi.spyOn(api, "getActiveRequesters").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/tickets"]}>
        <RequesterProvider>
          <Routes>
            <Route path="/select" element={<RequesterSelect />} />
            <Route
              path="/tickets"
              element={
                <RequireRequester>
                  <div>My Tickets Content</div>
                </RequireRequester>
              }
            />
          </Routes>
        </RequesterProvider>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Select Development Requester/i)).toBeInTheDocument();
    expect(screen.queryByText("My Tickets Content")).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
// Lab 2 moved this UI from App.tsx (now the router root) into SystemStatusCard, unchanged
// behavior — see docs/lab-02/specification.md §11. Same file, same assertions as Lab 1.
import SystemStatusCard from "../../src/components/SystemStatusCard.js";
import * as api from "../../src/api.js";

describe("SystemStatusCard (formerly App)", () => {
  // WORKED EXAMPLE — provided for you.
  it("renders the TokTickIT heading", () => {
    render(<SystemStatusCard />);
    expect(screen.getByText(/TokTickIT/i)).toBeInTheDocument();
  });

  // Issue 2 — the health check drives Online/Offline; categories arrive in Issue 4.
  it("shows an Offline error message when the API is unavailable", async () => {
    vi.spyOn(api, "checkSystem").mockRejectedValue(new Error("network error"));
    render(<SystemStatusCard />);

    fireEvent.click(screen.getByText("Check System"));

    await waitFor(() => {
      expect(screen.getByText(/Offline/i)).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to TokTickIT API/i)).toBeInTheDocument();
    });
  });

  // Issue 4 — the category list comes from the API, not hard-coded values.
  it("shows Online and the seeded categories on success", async () => {
    vi.spyOn(api, "checkSystem").mockResolvedValue({
      online: true,
      categories: [
        { id: 1, name: "Account and Access" },
        { id: 2, name: "Hardware" },
        { id: 3, name: "Software" },
        { id: 4, name: "Network" },
      ],
    });
    render(<SystemStatusCard />);

    fireEvent.click(screen.getByText("Check System"));

    await waitFor(() => {
      expect(screen.getByText(/Online/i)).toBeInTheDocument();
      expect(screen.getByText("Account and Access")).toBeInTheDocument();
      expect(screen.getByText("Hardware")).toBeInTheDocument();
      expect(screen.getByText("Software")).toBeInTheDocument();
      expect(screen.getByText("Network")).toBeInTheDocument();
    });
  });
});

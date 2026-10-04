import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import RequireAuth from "../../src/components/RequireAuth.js";
import * as api from "../../src/api.js";
import { REQUESTER_USER, renderWithAuth } from "../helpers/auth.js";

// UI-22 (AC-30) — a 401 arriving mid-session ends the client session: apiFetch (and the direct
// attachment download) announce it, AuthProvider clears the user, RequireAuth routes to Login.
// Requested by review on PR #40.

describe("session expiry handling", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("apiFetch announces a 401 from a protected endpoint", async () => {
    const handler = vi.fn();
    window.addEventListener(api.UNAUTHENTICATED_EVENT, handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Authentication required", code: "UNAUTHENTICATED" }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(api.apiFetch("/api/tickets")).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(api.UNAUTHENTICATED_EVENT, handler);
  });

  it("does not announce the 401 that login itself returns for wrong credentials", async () => {
    const handler = vi.fn();
    window.addEventListener(api.UNAUTHENTICATED_EVENT, handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password.", code: "INVALID_CREDENTIALS" }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(api.login("x@y.z", "nope")).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener(api.UNAUTHENTICATED_EVENT, handler);
  });

  it("the attachment download announces a 401 too", async () => {
    const handler = vi.fn();
    window.addEventListener(api.UNAUTHENTICATED_EVENT, handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    await expect(
      api.downloadAttachment({ id: 1, ticketId: 1, originalFilename: "a.png", sizeBytes: 1, mimeType: "image/png", uploadedAt: "", removedAt: null, removedReason: null })
    ).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener(api.UNAUTHENTICATED_EVENT, handler);
  });

  it("a signed-in page returns to Login when the session-expired event fires", async () => {
    renderWithAuth(
      <RequireAuth roles={["REQUESTER"]}>
        <div>My Tickets Page</div>
      </RequireAuth>,
      { user: REQUESTER_USER, route: "/tickets", path: "/tickets", extraRoutes: [{ path: "/login", element: <div>Login Page</div> }] }
    );
    expect(await screen.findByText("My Tickets Page")).toBeInTheDocument();

    window.dispatchEvent(new Event(api.UNAUTHENTICATED_EVENT));

    expect(await screen.findByText("Login Page")).toBeInTheDocument();
    expect(screen.queryByText("My Tickets Page")).not.toBeInTheDocument();
  });
});

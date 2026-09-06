import { defineConfig, devices } from "@playwright/test";

// Lab 2 Issue 6 — E2E + responsive/visual QA (docs/lab-02/tests.md RESP-01, E2E-01, E2E-02).
// Assumes the client (5173) and server (3001) dev servers are already running locally —
// see README.md for setup. Screenshots land in artifacts/lab-02/screenshots/.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0,
  // Tests share one real dev-server + Postgres instance (not isolated per worker), so running
  // several browser contexts concurrently against it caused intermittent timing flakes here.
  // Single-worker is slower but reliable — this suite is a small, occasional QA run, not a CI
  // suite optimizing for wall-clock time.
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  // All three viewports run on Chromium (the only browser installed here) — what matters for
  // responsive QA is the viewport size per ui-spec.md §6, not the rendering engine.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
  ],
});

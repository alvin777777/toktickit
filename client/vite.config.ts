import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    // jsdom only enables window.localStorage for a real http(s) origin — without this,
    // Node's own inert global `localStorage` (added in newer Node versions) shadows it
    // and every call throws. Needed from Lab 2 onward since RequesterContext uses it.
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    globals: true,
    setupFiles: "./tests/setup.ts",
    include: ["tests/**/*.test.tsx"],
  },
});

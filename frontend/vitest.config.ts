import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Tests live next to nothing — they all sit under tests/, mirroring the
    // source tree, so a glance at that folder says what is covered.
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
  },
  resolve: {
    // Matches the "@/*" -> "./*" path alias in tsconfig.json, so tests import
    // exactly the way application code does.
    alias: { "@": path.resolve(__dirname, "./") },
  },
});

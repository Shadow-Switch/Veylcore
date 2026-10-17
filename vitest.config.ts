import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@veylcore/shared": path.resolve(__dirname, "shared/src")
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts", "client/**/*.test.ts"]
  }
});

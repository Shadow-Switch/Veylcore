import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@veylcore/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 3000,
    open: false,
  },
});

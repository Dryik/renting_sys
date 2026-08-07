import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // `electron-builder install-app-deps` compiles the shipped better-sqlite3
      // binding against Electron's ABI, so plain-Node vitest cannot open a
      // database with it. `better-sqlite3-node` is the same version installed
      // as a dev-only npm alias, which keeps its Node-ABI build and lets the
      // database-backed tests exercise real SQLite. Production code and the
      // packaged app resolve the real package and are unaffected.
      "better-sqlite3": "better-sqlite3-node",
    },
  },
});

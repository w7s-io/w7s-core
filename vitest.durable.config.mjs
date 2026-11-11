import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./tests/durable/core-fixture.mjs",
    remoteBindings: false,
    miniflare: {
      compatibilityDate: "2026-08-06",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        USAGE_LEDGER: { className: "UsageLedger", useSQLite: true },
        OBJECTS: { className: "ObjectStore", useSQLite: true },
        PREVIEW_OBJECTS: { className: "PreviewObjectStore", useSQLite: true }
      }
    }
  })],
  test: { include: ["tests/durable/*.test.mjs"] }
});

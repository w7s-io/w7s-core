import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [cloudflareTest({
    main: "./tests/hosted/object-store.mjs", remoteBindings: false,
    miniflare: {
      compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      durableObjects: { OBJECTS: { className: "SmokeStore", useSQLite: true } },
      bindings: {
        SMOKE_HOSTS: JSON.stringify({ "smoke-a.example.com": "a", "smoke-b.example.com": "b" }),
        SMOKE_TOKEN: "a".repeat(64), SMOKE_EXPIRES: "4102444800000", SMOKE_REVISION: "v1", SMOKE_SERVICE: "fixture",
        W7S_BRANCH: "test", W7S_COMMIT_HASH: "b".repeat(40), W7S_DEPLOYED_AT: "2026-10-26T00:00:00Z", W7S_ENVIRONMENT: "test"
      }
    }
  })],
  test: { include: ["tests/hosted/*.test.mjs"] }
});

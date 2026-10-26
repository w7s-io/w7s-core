/// <reference types="node" />
import { it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStableScriptName } from "../names";

it("preserves SQLite through a local code update and restart, without sharing environment state", async () => {
  const persistence = await mkdtemp(join(tmpdir(), "w7s-do-test-"));
  const script = await readFile(new URL("../../tests/durable/fixture.mjs", import.meta.url), "utf8");
  const options = (version: string) => ({
    ...convertV4MiniflareOptions({
      workers: ["production", "preview"].map(environment => ({
        name: buildStableScriptName("example", "app", environment),
        modules: true,
        script: script.replace('const url = new URL(request.url);', `const url = new URL(request.url); if (url.pathname === '/version') return new Response('${version}');`),
        compatibilityDate: "2026-08-06",
        durableObjects: { OBJECTS: { className: "ObjectStore", useSQLite: true } }
      }))
    }),
    resourcePersistencePath: persistence
  });
  let runtime = new Miniflare(options("v1"));
  try {
    let production = await runtime.getWorker(buildStableScriptName("example", "app", "production"));
    expect(await (await production.fetch("https://example.test/?id=one", { method: "POST", body: "saved" })).json()).toBe("saved");
    await runtime.setOptions(options("v2"));
    production = await runtime.getWorker(buildStableScriptName("example", "app", "production"));
    expect(await (await production.fetch("https://example.test/version")).text()).toBe("v2");
    expect(await (await production.fetch("https://example.test/?id=one")).json()).toBe("saved");
    const preview = await runtime.getWorker(buildStableScriptName("example", "app", "preview"));
    expect(await (await preview.fetch("https://example.test/?id=one")).json()).toBeNull();
    await runtime.dispose();
    runtime = new Miniflare(options("v2"));
    production = await runtime.getWorker(buildStableScriptName("example", "app", "production"));
    expect(await (await production.fetch("https://example.test/?id=one")).json()).toBe("saved");
  } finally {
    await runtime.dispose();
    await rm(persistence, { recursive: true, force: true });
  }
}, 30000);

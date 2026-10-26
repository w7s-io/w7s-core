import { afterEach, describe, expect, it, vi } from "vitest";
import { readCustomDomains, branchCustomDomain, planCustomDomainClaims, attachCustomDomainRoutes } from "../deploy/customDomains";
import { createTestEnv as baseTestEnv } from "./mocks";
import { storeCustomDomainMappings, storeDeploymentRecord, replaceCustomDomainMappings, resolveCustomDomainRouteMappings, type DeploymentRecord } from "../storage/deployments";
import { dispatchWorker } from "../runtime/dispatch";
import { app } from "../worker";

const createTestEnv = () => baseTestEnv({ CLOUDFLARE_API_TOKEN: "test" });

const record = (repoSlug = "app", environment = "production"): DeploymentRecord => ({
  version: 1, orgSlug: "example", repoSlug, environment, repository: `example/${repoSlug}`,
  branch: "main", commitSha: "test", deployedAt: "2026-10-26T00:00:00Z", targets: {}
});
const wildcard = { hostname: "*.example.com", pathPrefix: "/" };
const read = (value: string) => readCustomDomains({
  entries: [], files: new Map([["CNAME", new TextEncoder().encode(value)]]), compressedBytes: 0, uncompressedBytes: 0
});
const provider = (txt: string[] = [], zones = true) => {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/zones?")) return Response.json({ success: true, result: zones ? [{ id: "zone", name: "example.com" }] : [] });
    if (url.includes("dns-query")) return Response.json({ Answer: txt.map(data => ({ type: 16, data: `"${data}"` })) });
    if (url.includes("/workers/routes")) return Response.json({ success: true, result: init?.method === "GET" ? [] : { id: "route" } });
    throw new Error(`Unexpected external request ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());

describe("generic wildcard domains", () => {
  it("accepts only a full leftmost wildcard and root mounts", () => {
    expect(read("*.EXAMPLE.com.\nauth.example.com")).toEqual([wildcard, { hostname: "auth.example.com", pathPrefix: "/" }]);
    for (const invalid of ["*example.com", "foo.*.example.com", "*.*.example.com", "*.com", "*.example.com/api"]) {
      expect(() => read(invalid)).toThrow();
    }
    expect(() => branchCustomDomain(wildcard, "preview")).toThrow(/direct branch/);
  });

  it("requires DNS authorization, including when TXT lookup fails", async () => {
    const env = createTestEnv();
    for (const txt of [[], ["other/app"], ["example/app"]]) {
      provider(txt);
      const plan = await planCustomDomainClaims({ env, routes: [wildcard], orgSlug: "example", repoSlug: "app" });
      expect(plan.attached.length).toBe(txt.includes("example/app") ? 1 : 0);
    }
    provider();
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementationOnce(async () => Response.json({ success: true, result: [{ id: "zone", name: "example.com" }] }));
    fetch.mockImplementationOnce(async () => { throw new Error("DNS unavailable"); });
    expect((await planCustomDomainClaims({ env, routes: [wildcard], orgSlug: "example", repoSlug: "app" })).attached).toEqual([]);
  });

  it("rejects unsupported SaaS wildcards without provisioning", async () => {
    const fetch = provider([], false);
    await expect(planCustomDomainClaims({ env: createTestEnv(), routes: [wildcard], orgSlug: "example", repoSlug: "app" })).rejects.toThrow(/SaaS wildcard/);
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it("rejects the platform wildcard before external requests", async () => {
    const fetch = provider(["example"]);
    await expect(planCustomDomainClaims({ env: createTestEnv(), routes: [{ hostname: "*.w7s.cloud", pathPrefix: "/" }], orgSlug: "example", repoSlug: "app" })).rejects.toThrow(/platform domain/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks replacement by another application or environment", async () => {
    const env = createTestEnv();
    await storeCustomDomainMappings(env, record(), [wildcard]);
    provider(["example"]);
    for (const [repoSlug, environment] of [["other", "production"], ["app", "preview"]]) {
      const plan = await planCustomDomainClaims({ env, routes: [wildcard], orgSlug: "example", repoSlug, environment });
      expect(plan.blocked[0]?.reason).toBe("wildcard_claim_conflict");
    }
    expect((await planCustomDomainClaims({ env, routes: [wildcard], orgSlug: "example", repoSlug: "app" })).attached).toHaveLength(1);
    provider();
    expect((await planCustomDomainClaims({ env, routes: [{ hostname: "auth.example.com", pathPrefix: "/" }], orgSlug: "other", repoSlug: "app" })).attached).toEqual([]);
  });

  it("matches one label, gives exact hosts precedence, and reserves path-only exact hosts", async () => {
    const env = createTestEnv();
    await storeCustomDomainMappings(env, record(), [wildcard]);
    await storeCustomDomainMappings(env, record("auth"), ["auth.example.com"]);
    await storeCustomDomainMappings(env, record("api"), [{ hostname: "special.example.com", pathPrefix: "/api" }]);
    expect((await resolveCustomDomainRouteMappings(env, "new.example.com", "/"))[0]?.repoSlug).toBe("app");
    expect((await resolveCustomDomainRouteMappings(env, "auth.example.com", "/"))[0]?.repoSlug).toBe("auth");
    for (const host of ["example.com", "deep.new.example.com", "evil-example.com", "example.com.evil.net", "special.example.com"]) {
      expect(await resolveCustomDomainRouteMappings(env, host, "/")).toEqual([]);
    }
    expect((await resolveCustomDomainRouteMappings(env, "special.example.com", "/api/items"))[0]?.repoSlug).toBe("api");
  });

  it("attaches the wildcard Worker route without creating DNS records", async () => {
    const fetch = provider(["example"]);
    const env = createTestEnv();
    await attachCustomDomainRoutes(env, [wildcard]);
    const call = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ pattern: "*.example.com/*" });
    expect(fetch.mock.calls.some(([url]) => String(url).includes("dns_records"))).toBe(false);
  });

  it("preserves original hostname during application dispatch", async () => {
    const env = createTestEnv();
    env.DISPATCHER = { get: () => ({
      fetch: async (input) => new Response(input instanceof Request ? input.url : String(input)),
      connect: () => { throw new Error("Unexpected socket connection"); }
    }) };
    const response = await dispatchWorker({ env, request: new Request("https://new.example.com/gallery"), repoPath: "/gallery", repoSlug: "app", orgSlug: "example", scriptName: "app" });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("new.example.com");
  });

  it("routes through W7S, retains exact overrides across wildcard updates, and removes stale mappings", async () => {
    const env = createTestEnv();
    env.DISPATCHER = { get: (script) => ({
      fetch: async (input) => new Response(`${script}:${input instanceof Request ? input.url : String(input)}`),
      connect: () => { throw new Error("Unexpected socket connection"); }
    }) };
    const shared = record();
    const auth = record("auth");
    const worker = { namespace: "test", entrypoint: "index.js", compatibilityDate: "2026-08-06", startupTimeMs: null };
    shared.targets.worker = { ...worker, scriptName: "shared" };
    auth.targets.worker = { ...worker, scriptName: "auth" };
    await storeDeploymentRecord(env, shared);
    await storeDeploymentRecord(env, auth);
    await storeCustomDomainMappings(env, shared, [wildcard]);
    await storeCustomDomainMappings(env, auth, ["auth.example.com"]);
    // Application routes must take precedence over platform control-plane paths.
    for (const path of ["/health", "/api/v1/health", "/api/v1/status", "/api/v1/deploy"]) {
      for (const [host, script] of [["new.example.com", "shared"], ["auth.example.com", "auth"]]) {
        const response = await app.fetch(new Request(`https://${host}${path}`, {
          method: path === "/api/v1/deploy" ? "POST" : "GET"
        }), env);
        expect(await response.text()).toBe(`${script}:https://${host}${path}`);
      }
    }
    const request = (host: string) => app.fetch(new Request(`https://${host}/gallery`), env);
    expect(await (await request("new.example.com")).text()).toBe("shared:https://new.example.com/gallery");
    await replaceCustomDomainMappings(env, shared, [wildcard]);
    expect(await (await request("auth.example.com")).text()).toBe("auth:https://auth.example.com/gallery");
    expect((await request("deep.new.example.com")).status).toBe(404);
    await replaceCustomDomainMappings(env, shared, []);
    expect((await request("new.example.com")).status).toBe(404);
    expect(await (await request("auth.example.com")).text()).toBe("auth:https://auth.example.com/gallery");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker";
import { createTestEnv } from "./mocks";
import {
  storeDeploymentRecord,
  storeManagedResourceRecord,
  type DeploymentRecord
} from "../storage/deployments";

const authHeaders = (token = "github-token") => ({
  authorization: `Bearer ${token}`
});

const stubGitHubAuth = (allowed = true) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://api.github.com/repos/")) {
        return allowed
          ? Response.json({ full_name: "w7s-io/demo" })
          : Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({ success: true, result: {} });
    })
  );
};

const deploymentRecord = (): DeploymentRecord => ({
  version: 1,
  orgSlug: "w7s-io",
  repoSlug: "demo",
  environment: "production",
  repository: "w7s-io/demo",
  branch: "main",
  commitSha: "abc123",
  deployedAt: "2026-06-09T12:00:00.000Z",
  customDomains: ["demo.example.com"],
  routing: {
    defaultDomain: true
  },
  bindings: {
    kv: [
      {
        binding: "CACHE",
        name: "w7s-production-w7s-io-demo-cache",
        namespaceId: "kv-123"
      }
    ],
    secrets: ["PRIVATE_API_KEY"],
    vars: ["PUBLIC_API_URL"]
  },
  rpc: {
    binding: "W7S_RPC",
    tokenHash: "rpc-token-hash",
    allow: ["w7s-io"]
  },
  queue: {
    binding: "W7S_QUEUE",
    tokenHash: "queue-token-hash",
    allow: ["w7s-io"],
    queues: [
      {
        name: "jobs",
        queueName: "w7s-production-w7s-io-demo-jobs",
        queueId: "queue-123",
        consumer: "/_w7s/queues/jobs"
      }
    ]
  },
  workflow: {
    binding: "W7S_WORKFLOW",
    tokenHash: "workflow-token-hash",
    allow: [],
    workflows: [
      {
        name: "process",
        path: "/_w7s/workflows/process"
      }
    ]
  },
  ai: {
    binding: "AI",
    tokenHash: "ai-token-hash"
  },
  schedules: [
    {
      cron: "*/5 * * * *",
      path: "/_w7s/schedules/sync"
    }
  ],
  targets: {
    static: {
      manifestKey: "static_manifest:v1:production:w7s-io:demo:static",
      assetPrefix: "static-v1-production-w7s-io-demo-abc123",
      fileCount: 3,
      totalSize: 42,
      hasIndex: true
    },
    worker: {
      namespace: "w7s-isolate",
      scriptName: "w7s-io--demo--production--abc123",
      entrypoint: "backend/index.ts",
      compatibilityDate: "2026-05-23",
      startupTimeMs: 17,
      tags: ["w7s"]
    }
  }
});

describe("agent API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes public agent discovery and OpenAPI documents", async () => {
    const env = createTestEnv();

    for (const path of ["/agent.json", "/.well-known/agent.json"]) {
      const response = await app.fetch(new Request(`https://w7s.cloud${path}`), env);
      const body = await response.json() as {
        name: string;
        authentication: { type: string };
        api: { openapi: string };
        capabilities: { mode: string; mutationApi: boolean };
      };

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=300");
      expect(body.name).toBe("W7S Cloud Agent API");
      expect(body.authentication.type).toBe("github_oidc");
      expect(body.capabilities).toMatchObject({
        mode: "read-only",
        mutationApi: false
      });
      expect(body.api.openapi).toBe("https://w7s.cloud/api/v1/agent/openapi.json");
    }

    const openApi = await app.fetch(new Request("https://w7s.cloud/api/v1/agent/openapi.json"), env);
    const openApiBody = await openApi.json() as { paths: Record<string, unknown> };
    expect(openApi.status).toBe(200);
    expect(openApiBody.paths).toHaveProperty("/api/v1/agent/repos/{owner}/{repo}");

    const schema = await app.fetch(new Request("https://w7s.cloud/api/v1/agent/manifest-schema"), env);
    const schemaBody = await schema.json() as { title: string; properties: Record<string, unknown> };
    expect(schema.status).toBe(200);
    expect(schemaBody.title).toBe("W7S app manifest");
    expect(schemaBody.properties).toHaveProperty("bindings");
  });

  it("returns consolidated authenticated infrastructure state without token hashes", async () => {
    stubGitHubAuth();
    const env = createTestEnv();
    const record = deploymentRecord();
    await storeDeploymentRecord(env, record);
    await storeManagedResourceRecord(env, {
      version: 1,
      kind: "kv",
      orgSlug: "w7s-io",
      repoSlug: "demo",
      environment: "production",
      binding: "CACHE",
      name: "w7s-production-w7s-io-demo-cache",
      id: "kv-123",
      createdAt: "2026-06-09T12:00:00.000Z",
      updatedAt: "2026-06-09T12:00:00.000Z"
    });

    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo", {
        headers: authHeaders()
      }),
      env
    );
    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as {
      status: string;
      data: {
        deployment: { commitSha: string; url: string };
        resources: {
          managedResources: Array<{ kind: string; binding: string }>;
          rpc: { binding: string };
          ai: { binding: string };
        };
        capabilities: { nativeBackend: boolean; queues: boolean };
        _links: { logs: string; manifestSchema: string };
      };
    };

    expect(response.status).toBe(200);
    expect(body.status).toBe("success");
    expect(body.data.deployment.commitSha).toBe("abc123");
    expect(body.data.deployment.url).toBe("https://demo.example.com/");
    expect(body.data.resources.managedResources).toContainEqual(
      expect.objectContaining({
        kind: "kv",
        binding: "CACHE"
      })
    );
    expect(body.data.resources.rpc).toEqual({ binding: "W7S_RPC", allow: ["w7s-io"] });
    expect(body.data.resources.ai).toEqual({ binding: "AI" });
    expect(body.data.capabilities).toMatchObject({
      nativeBackend: true,
      queues: true
    });
    expect(body.data._links.logs).toBe("https://w7s.cloud/api/v1/logs/w7s-io/demo?environment=production");
    expect(body.data._links.manifestSchema).toBe("https://w7s.cloud/api/v1/agent/manifest-schema");
    expect(bodyText).not.toContain("tokenHash");
    expect(bodyText).not.toContain("rpc-token-hash");
    expect(bodyText).not.toContain("queue-token-hash");
    expect(bodyText).not.toContain("workflow-token-hash");
    expect(bodyText).not.toContain("ai-token-hash");
  });

  it("returns empty read-only state and next actions for undeployed repos", async () => {
    stubGitHubAuth();
    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo?environment=preview", {
        headers: authHeaders()
      }),
      createTestEnv()
    );
    const body = await response.json() as {
      data: {
        environment: string;
        deployment: null;
        capabilities: { deployed: boolean; directMutationApi: boolean };
        nextActions: string[];
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.environment).toBe("preview");
    expect(body.data.deployment).toBeNull();
    expect(body.data.capabilities).toMatchObject({
      deployed: false,
      directMutationApi: false
    });
    expect(body.data.nextActions.join("\n")).toContain("deploy workflow");
  });

  it("supports deployment, resource, and route drill-down endpoints", async () => {
    stubGitHubAuth();
    const env = createTestEnv();
    await storeDeploymentRecord(env, deploymentRecord());

    const deployments = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo/deployments", {
        headers: authHeaders()
      }),
      env
    );
    const deploymentBody = await deployments.json() as { data: { deployments: unknown[] } };
    expect(deployments.status).toBe(200);
    expect(deploymentBody.data.deployments).toHaveLength(1);

    const resources = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo/resources", {
        headers: authHeaders()
      }),
      env
    );
    const resourceText = await resources.text();
    expect(resources.status).toBe(200);
    expect(resourceText).toContain("PUBLIC_API_URL");
    expect(resourceText).not.toContain("tokenHash");

    const routes = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo/routes", {
        headers: authHeaders()
      }),
      env
    );
    const routesBody = await routes.json() as { data: { routes: { primaryUrl: string; customDomains: string[] } } };
    expect(routes.status).toBe(200);
    expect(routesBody.data.routes.primaryUrl).toBe("https://demo.example.com/");
    expect(routesBody.data.routes.customDomains).toEqual(["demo.example.com"]);
  });

  it("rejects missing and unauthorized bearer tokens", async () => {
    let response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo"),
      createTestEnv()
    );
    expect(response.status).toBe(401);

    stubGitHubAuth(false);
    response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/agent/repos/w7s-io/demo", {
        headers: authHeaders("wrong-token")
      }),
      createTestEnv()
    );
    expect(response.status).toBe(401);
  });
});

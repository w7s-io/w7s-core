import type { Context } from "hono";
import type { Env } from "../env";
import { parseGitHubRepository, verifyGitHubRepoAccess } from "../deploy/githubAuth";
import { json, jsonError, jsonSuccess, parseBearerToken } from "../http";
import { requireSlug, resolveEnvironment, sanitizeScriptPart } from "../names";
import {
  listDeploymentRecords,
  listManagedResourceRecords,
  loadDeploymentRecord,
  type DeploymentRecord
} from "../storage/deployments";
import { loadEffectiveUsageLimitPolicies } from "../usageLimits";
import { loadAppLimitState } from "../appLimits";

type HonoContext = Context<{ Bindings: Env }>;

const DEFAULT_BASE_DOMAIN = "w7s.cloud";
const DOCS_URL = "https://www.w7s.io/docs/";
const AGENT_DOCS_URL = "https://www.w7s.io/docs/agent-api/";
const SERVICE_NAME = "W7S Cloud Agent API";
const SERVICE_DESCRIPTION =
  "Read-only agent-facing API for inspecting W7S deployments, managed infrastructure, routes, usage links, logs, and safe next actions.";

const jsonPublic = (payload: unknown) =>
  json(payload, 200, {
    "cache-control": "public, max-age=300"
  });

const baseUrl = (env: Env) => `https://${env.W7S_BASE_DOMAIN?.trim() || DEFAULT_BASE_DOMAIN}`;

const apiUrl = (env: Env, path: string) => `${baseUrl(env)}${path}`;

const pathSegments = (path: string) =>
  path.split("/").map((segment) => segment.trim()).filter(Boolean);

const repoApiPath = (owner: string, repo: string, suffix = "") =>
  `/api/v1/agent/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;

const parseAgentRepoTarget = (c: HonoContext) => {
  const segments = pathSegments(new URL(c.req.url).pathname);
  const apiIndex = segments.findIndex((segment, index) =>
    segment === "api" && segments[index + 1] === "v1" && segments[index + 2] === "agent"
  );
  const owner = segments[apiIndex + 4];
  const repo = segments[apiIndex + 5];
  const tail = segments.slice(apiIndex + 6);
  if (apiIndex < 0 || segments[apiIndex + 3] !== "repos" || !owner || !repo) {
    throw new Error("Agent route must be /api/v1/agent/repos/<owner>/<repo>.");
  }
  return {
    owner: decodeURIComponent(owner),
    repo: decodeURIComponent(repo),
    orgSlug: requireSlug(decodeURIComponent(owner), "agent owner"),
    repoSlug: requireSlug(decodeURIComponent(repo), "agent repo"),
    tail
  };
};

const authenticateRepo = async (c: HonoContext, owner: string, repo: string) => {
  const token = parseBearerToken(c.req.raw);
  if (!token) return { response: jsonError("Missing bearer token.", 401) };
  const repository = parseGitHubRepository(`${owner}/${repo}`);
  if (!repository) return { response: jsonError("Repository must be in owner/repo form.", 400) };
  const allowed = await verifyGitHubRepoAccess({
    token,
    owner: repository.owner,
    repo: repository.repo
  });
  if (!allowed) {
    return { response: jsonError("Bearer token is not authorized for this GitHub repository.", 401) };
  }
  return { token };
};

const publicDeploymentUrl = (
  env: Env,
  record: Pick<DeploymentRecord, "orgSlug" | "repoSlug" | "environment" | "customDomains">
) => {
  if (record.customDomains?.[0]) return `https://${record.customDomains[0]}/`;
  const domain = env.W7S_BASE_DOMAIN?.trim() || DEFAULT_BASE_DOMAIN;
  const host =
    record.environment === "production"
      ? `${record.orgSlug}.${domain}`
      : `${sanitizeScriptPart(record.environment)}--${record.orgSlug}.${domain}`;
  return record.repoSlug === record.orgSlug ? `https://${host}/` : `https://${host}/${record.repoSlug}/`;
};

const defaultDeploymentUrl = (
  env: Env,
  record: Pick<DeploymentRecord, "orgSlug" | "repoSlug" | "environment">
) => {
  const domain = env.W7S_BASE_DOMAIN?.trim() || DEFAULT_BASE_DOMAIN;
  const host =
    record.environment === "production"
      ? `${record.orgSlug}.${domain}`
      : `${sanitizeScriptPart(record.environment)}--${record.orgSlug}.${domain}`;
  return record.repoSlug === record.orgSlug ? `https://${host}/` : `https://${host}/${record.repoSlug}/`;
};

const sanitizeDeployment = (env: Env, record: DeploymentRecord) => ({
  version: record.version,
  repository: record.repository,
  owner: record.orgSlug,
  repo: record.repoSlug,
  environment: record.environment,
  branch: record.branch,
  commitSha: record.commitSha,
  deployedAt: record.deployedAt,
  url: publicDeploymentUrl(env, record),
  routing: {
    defaultDomain: record.routing?.defaultDomain ?? true,
    customDomains: record.customDomains ?? []
  },
  targets: {
    ...(record.targets.static
      ? {
          static: {
            fileCount: record.targets.static.fileCount,
            totalSize: record.targets.static.totalSize ?? null,
            hasIndex: record.targets.static.hasIndex,
            assetPrefix: record.targets.static.assetPrefix
          }
        }
      : {}),
    ...(record.targets.worker
      ? {
          worker: {
            namespace: record.targets.worker.namespace,
            scriptName: record.targets.worker.scriptName,
            entrypoint: record.targets.worker.entrypoint,
            compatibilityDate: record.targets.worker.compatibilityDate,
            startupTimeMs: record.targets.worker.startupTimeMs,
            tags: record.targets.worker.tags ?? []
          }
        }
      : {})
  }
});

const resourceSummary = (record: DeploymentRecord | null, managedResources: unknown[]) => ({
  bindings: record?.bindings ?? {},
  managedResources,
  queues: record?.queue
    ? {
        binding: record.queue.binding,
        allow: record.queue.allow,
        queues: record.queue.queues
      }
    : null,
  schedules: record?.schedules ?? [],
  workflows: record?.workflow
    ? {
        binding: record.workflow.binding,
        allow: record.workflow.allow,
        workflows: record.workflow.workflows
      }
    : null,
  rpc: record?.rpc
    ? {
        binding: record.rpc.binding,
        allow: record.rpc.allow
      }
    : null,
  ai: record?.ai
    ? {
        binding: record.ai.binding
      }
    : null
});

const routesSummary = (env: Env, record: DeploymentRecord | null, orgSlug: string, repoSlug: string, environment: string) => {
  const routeRecord = record ?? {
    orgSlug,
    repoSlug,
    environment
  };
  return {
    defaultDomainEnabled: record?.routing?.defaultDomain ?? true,
    defaultUrl: defaultDeploymentUrl(env, routeRecord),
    primaryUrl: record ? publicDeploymentUrl(env, record) : defaultDeploymentUrl(env, routeRecord),
    customDomains: record?.customDomains ?? []
  };
};

const capabilitiesFor = (record: DeploymentRecord | null) => ({
  deployed: Boolean(record),
  staticHosting: Boolean(record?.targets.static),
  nativeBackend: Boolean(record?.targets.worker),
  storageBindings: Boolean(record?.bindings && Object.keys(record.bindings).length > 0),
  queues: Boolean(record?.queue?.queues.length),
  schedules: Boolean(record?.schedules?.length),
  workflows: Boolean(record?.workflow?.workflows.length),
  rpc: Boolean(record?.rpc),
  ai: Boolean(record?.ai),
  customDomains: Boolean(record?.customDomains?.length),
  readOnlyAgentApi: true,
  directMutationApi: false
});

const linksFor = (env: Env, owner: string, repo: string, environment: string) => ({
  self: apiUrl(env, `${repoApiPath(owner, repo)}?environment=${encodeURIComponent(environment)}`),
  deployments: apiUrl(env, repoApiPath(owner, repo, "/deployments")),
  resources: apiUrl(env, `${repoApiPath(owner, repo, "/resources")}?environment=${encodeURIComponent(environment)}`),
  routes: apiUrl(env, `${repoApiPath(owner, repo, "/routes")}?environment=${encodeURIComponent(environment)}`),
  usage: apiUrl(env, `/api/v1/usage/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?environment=${encodeURIComponent(environment)}`),
  limits: apiUrl(env, `/api/v1/limits/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?environment=${encodeURIComponent(environment)}`),
  analytics: apiUrl(env, `/api/v1/analytics/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?environment=${encodeURIComponent(environment)}`),
  logs: apiUrl(env, `/api/v1/logs/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?environment=${encodeURIComponent(environment)}`),
  manifestSchema: apiUrl(env, "/api/v1/agent/manifest-schema"),
  docs: AGENT_DOCS_URL
});

const nextActionsFor = (record: DeploymentRecord | null) => {
  if (!record) {
    return [
      "Add a W7S deploy workflow to the repository.",
      "Commit deployable static output or a backend/worker entrypoint.",
      "Redeploy from GitHub Actions with id-token: write."
    ];
  }
  const actions = [
    "Use w7s.json in the repo to declare or change infrastructure.",
    "Redeploy from GitHub Actions to apply infrastructure changes."
  ];
  if (!record.targets.worker) actions.push("Add backend/index.ts or worker/index.ts before declaring queues, schedules, workflows, Durable Objects, or Hyperdrive.");
  if (!record.bindings) actions.push("Add bindings to w7s.json when the app needs KV, R2, D1, Durable Objects, Hyperdrive, AI, vars, or secrets.");
  if (!record.customDomains?.length) actions.push("Add a CNAME file and DNS when the app needs a custom domain.");
  return actions;
};

const readEnvironment = (c: HonoContext) =>
  resolveEnvironment({
    branch: "main",
    queryValue: c.req.query("environment"),
    headerValue: c.req.header("x-w7s-environment")
  });

const allRepoDeployments = async (env: Env, orgSlug: string, repoSlug: string) =>
  (await listDeploymentRecords(env))
    .filter((record) => record.orgSlug === orgSlug && record.repoSlug === repoSlug)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));

const repoState = async (c: HonoContext, target: ReturnType<typeof parseAgentRepoTarget>, environment: string) => {
  const record = await loadDeploymentRecord(c.env, environment, target.orgSlug, target.repoSlug);
  const resources = await listManagedResourceRecords(c.env, environment, target.orgSlug, target.repoSlug);
  const limits = await loadEffectiveUsageLimitPolicies(c.env, {
    environment,
    orgSlug: target.orgSlug,
    repoSlug: target.repoSlug
  });
  const appLimitState = await loadAppLimitState(c.env, {
    environment,
    orgSlug: target.orgSlug,
    repoSlug: target.repoSlug
  });
  return {
    repository: `${target.orgSlug}/${target.repoSlug}`,
    owner: target.orgSlug,
    repo: target.repoSlug,
    environment,
    deployment: record ? sanitizeDeployment(c.env, record) : null,
    urls: routesSummary(c.env, record, target.orgSlug, target.repoSlug, environment),
    resources: resourceSummary(record, resources),
    capabilities: capabilitiesFor(record),
    observability: {
      usage: linksFor(c.env, target.owner, target.repo, environment).usage,
      limits: linksFor(c.env, target.owner, target.repo, environment).limits,
      analytics: linksFor(c.env, target.owner, target.repo, environment).analytics,
      logs: linksFor(c.env, target.owner, target.repo, environment).logs
    },
    limits: {
      version: limits.version,
      period: limits.period,
      mode: limits.mode,
      policy: limits.policy,
      appLimitState: appLimitState ?? null
    },
    nextActions: nextActionsFor(record),
    _links: linksFor(c.env, target.owner, target.repo, environment)
  };
};

export const handleAgentDiscoveryGet = (c: HonoContext) =>
  jsonPublic({
    schemaVersion: "1.0",
    name: SERVICE_NAME,
    description: SERVICE_DESCRIPTION,
    url: baseUrl(c.env),
    docs: AGENT_DOCS_URL,
    contact: "https://github.com/w7s-io/w7s-core",
    authentication: {
      type: "github_oidc",
      audience: ["w7s.cloud", "https://w7s.cloud", "https://github.com/<owner>"],
      header: "Authorization: Bearer <github-actions-oidc-token>",
      requiredRepositoryScope: true
    },
    capabilities: {
      mode: "read-only",
      actions: [
        "inspect_repository_infrastructure",
        "list_deployments",
        "list_resources",
        "inspect_routes",
        "discover_manifest_schema",
        "link_usage_logs_analytics"
      ],
      mutationApi: false
    },
    api: {
      openapi: apiUrl(c.env, "/api/v1/agent/openapi.json"),
      manifestSchema: apiUrl(c.env, "/api/v1/agent/manifest-schema"),
      repoStateTemplate: apiUrl(c.env, "/api/v1/agent/repos/{owner}/{repo}"),
      deploymentsTemplate: apiUrl(c.env, "/api/v1/agent/repos/{owner}/{repo}/deployments"),
      resourcesTemplate: apiUrl(c.env, "/api/v1/agent/repos/{owner}/{repo}/resources"),
      routesTemplate: apiUrl(c.env, "/api/v1/agent/repos/{owner}/{repo}/routes")
    },
    links: {
      docs: DOCS_URL,
      agentDocs: AGENT_DOCS_URL,
      llms: "https://www.w7s.io/llms.txt",
      github: "https://github.com/w7s-io/w7s-core"
    }
  });

export const handleAgentOpenApiGet = (c: HonoContext) =>
  jsonPublic({
    openapi: "3.1.0",
    info: {
      title: SERVICE_NAME,
      version: "1.0.0",
      description: SERVICE_DESCRIPTION
    },
    servers: [{ url: baseUrl(c.env) }],
    security: [{ githubOidc: [] }],
    components: {
      securitySchemes: {
        githubOidc: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "GitHub Actions OIDC JWT or GitHub API token"
        }
      }
    },
    paths: {
      "/agent.json": { get: { security: [], summary: "Discover the W7S agent API" } },
      "/api/v1/agent/openapi.json": { get: { security: [], summary: "Read the W7S agent OpenAPI document" } },
      "/api/v1/agent/manifest-schema": { get: { security: [], summary: "Read the w7s.json manifest schema" } },
      "/api/v1/agent/repos/{owner}/{repo}": { get: { summary: "Read consolidated repository infrastructure state" } },
      "/api/v1/agent/repos/{owner}/{repo}/deployments": { get: { summary: "List deployments for a repository" } },
      "/api/v1/agent/repos/{owner}/{repo}/resources": { get: { summary: "List resources for a repository environment" } },
      "/api/v1/agent/repos/{owner}/{repo}/routes": { get: { summary: "Read public routes for a repository environment" } }
    }
  });

export const handleAgentManifestSchemaGet = () =>
  jsonPublic({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://w7s.cloud/api/v1/agent/manifest-schema",
    title: "W7S app manifest",
    description: "Read-only schema summary for w7s.json. Commit changes to the repo and redeploy to apply infrastructure changes.",
    type: "object",
    additionalProperties: true,
    properties: {
      bindings: {
        type: "object",
        properties: {
          kv: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
          r2: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
          d1: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
          durableObjects: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
          hyperdrive: { type: "array", items: { type: "object" } },
          ai: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } }
        }
      },
      queues: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      schedules: { type: "array", items: { type: "object" } },
      workflows: { type: "array", items: { anyOf: [{ type: "string" }, { type: "object" }] } },
      vars: { type: "array", items: { type: "string" } },
      secrets: { type: "array", items: { type: "string" } },
      queue: { type: "object", properties: { allow: { type: "array", items: { type: "string" } } } },
      workflow: { type: "object", properties: { allow: { type: "array", items: { type: "string" } } } },
      rpc: { type: "object", properties: { allow: { type: "array", items: { type: "string" } } } },
      routing: { type: "object", properties: { defaultDomain: { type: "boolean" } } }
    },
    examples: [
      {
        bindings: {
          kv: ["CACHE"],
          r2: ["FILES"],
          d1: [{ binding: "DB", migrations: "migrations" }],
          ai: ["AI"]
        },
        queues: ["jobs"],
        schedules: [{ cron: "*/5 * * * *", path: "/_w7s/schedules/sync" }],
        workflows: ["process-order"],
        rpc: { allow: ["w7s-io"] }
      }
    ]
  });

export const handleAgentRepoGet = async (c: HonoContext) => {
  let target: ReturnType<typeof parseAgentRepoTarget>;
  let environment: string;
  try {
    target = parseAgentRepoTarget(c);
    environment = readEnvironment(c);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
  const auth = await authenticateRepo(c, target.owner, target.repo);
  if ("response" in auth) return auth.response;

  if (target.tail.length === 0) {
    return jsonSuccess(await repoState(c, target, environment));
  }
  if (target.tail.length === 1 && target.tail[0] === "deployments") {
    return jsonSuccess({
      repository: `${target.orgSlug}/${target.repoSlug}`,
      deployments: (await allRepoDeployments(c.env, target.orgSlug, target.repoSlug))
        .map((record) => sanitizeDeployment(c.env, record)),
      _links: linksFor(c.env, target.owner, target.repo, environment)
    });
  }
  if (target.tail.length === 1 && target.tail[0] === "resources") {
    const record = await loadDeploymentRecord(c.env, environment, target.orgSlug, target.repoSlug);
    const resources = await listManagedResourceRecords(c.env, environment, target.orgSlug, target.repoSlug);
    return jsonSuccess({
      repository: `${target.orgSlug}/${target.repoSlug}`,
      environment,
      resources: resourceSummary(record, resources),
      _links: linksFor(c.env, target.owner, target.repo, environment)
    });
  }
  if (target.tail.length === 1 && target.tail[0] === "routes") {
    const record = await loadDeploymentRecord(c.env, environment, target.orgSlug, target.repoSlug);
    return jsonSuccess({
      repository: `${target.orgSlug}/${target.repoSlug}`,
      environment,
      routes: routesSummary(c.env, record, target.orgSlug, target.repoSlug, environment),
      _links: linksFor(c.env, target.owner, target.repo, environment)
    });
  }
  return jsonError("Unknown agent endpoint.", 404);
};

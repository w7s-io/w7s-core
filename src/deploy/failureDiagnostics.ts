import { jsonError, jsonSuccess, parseBearerToken } from "../http";
import type { Env } from "../env";
import { parseGitHubRepository, verifyGitHubRepoAccess } from "./githubAuth";
import { writeAnalyticsEvent } from "../analytics";

const FAILURE_PREFIX = "deploy_failure:v1:";
const FAILURE_RETENTION_SECONDS = 60 * 60 * 24 * 30;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export type DeployFailureStage =
  | "request.validate"
  | "github.authorize"
  | "archive.read"
  | "manifest.read"
  | "billing.reserve"
  | "worker.publish"
  | "static.publish"
  | "custom-domains.plan"
  | "metadata.store"
  | "route-mappings.store"
  | "queue-mappings.store"
  | "schedule-mappings.store"
  | "worker-routes.attach"
  | "analytics.record"
  | "billing.capture";

export type DeployFailureDiagnostic = {
  version: 1;
  diagnosticId: string;
  createdAt: string;
  stage: DeployFailureStage;
  repository?: string;
  environment?: string;
  branch?: string;
  commitSha?: string;
  application?: string;
  error: {
    name: string;
    message: string;
    status?: number;
    cfRay?: string;
  };
};

export type DeployFailureContext = {
  diagnosticId: string;
  stage: DeployFailureStage;
  repository?: string;
  environment?: string;
  branch?: string;
  commitSha?: string;
  application?: string;
};

export const createDeployFailureContext = (): DeployFailureContext => ({
  diagnosticId: crypto.randomUUID(),
  stage: "request.validate"
});

export const deployFailureKey = (diagnosticId: string) => `${FAILURE_PREFIX}${diagnosticId}`;

const errorDetails = (error: unknown) => {
  const annotated: { status?: unknown; cfRay?: unknown } = error && typeof error === "object"
    ? error as Error & { status?: unknown; cfRay?: unknown }
    : {};
  const name = error instanceof Error && error.name ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: name.slice(0, 120),
    message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
    ...(typeof annotated.status === "number" ? { status: annotated.status } : {}),
    ...(typeof annotated.cfRay === "string" ? { cfRay: annotated.cfRay.slice(0, 120) } : {})
  };
};

export const storeDeployFailureDiagnostic = async (
  env: Env,
  context: DeployFailureContext,
  error: unknown
) => {
  const record: DeployFailureDiagnostic = {
    version: 1,
    diagnosticId: context.diagnosticId,
    createdAt: new Date().toISOString(),
    stage: context.stage,
    ...(context.repository ? { repository: context.repository } : {}),
    ...(context.environment ? { environment: context.environment } : {}),
    ...(context.branch ? { branch: context.branch } : {}),
    ...(context.commitSha ? { commitSha: context.commitSha } : {}),
    ...(context.application ? { application: context.application } : {}),
    error: errorDetails(error)
  };
  await env.DEPLOYMENTS_KV.put(deployFailureKey(context.diagnosticId), JSON.stringify(record), {
    expirationTtl: FAILURE_RETENTION_SECONDS
  });
  return record;
};

export const deploymentFailureResponse = async (
  env: Env,
  context: DeployFailureContext,
  error: unknown
) => {
  if (context.repository && context.environment) {
    writeAnalyticsEvent(env, {
      event: "deploy",
      repository: context.repository,
      environment: context.environment,
      orgSlug: context.repository.split("/")[0] ?? "unknown",
      repoSlug: context.repository.split("/")[1] ?? "unknown",
      outcome: "error",
      source: context.stage,
      status: 500,
      count: 1
    });
  }
  try {
    await storeDeployFailureDiagnostic(env, context, error);
  } catch {
    // A failed diagnostic write must never hide the deployment failure itself.
  }
  const response = jsonError(
    `Deployment failed during ${context.stage}. Include diagnostic ID ${context.diagnosticId} when requesting support.`,
    500,
    { diagnosticId: context.diagnosticId, stage: context.stage },
  );
  response.headers.set("x-w7s-diagnostic-id", context.diagnosticId);
  return response;
};

export const handleDeployFailureGet = async (request: Request, env: Env, diagnosticId: string) => {
  const token = parseBearerToken(request);
  if (!token) return jsonError("Missing bearer token.", 401);
  if (!/^[0-9a-f-]{36}$/i.test(diagnosticId)) return jsonError("Invalid diagnostic ID.", 400);
  const diagnostic = await env.DEPLOYMENTS_KV.get(deployFailureKey(diagnosticId), "json") as DeployFailureDiagnostic | null;
  if (!diagnostic || diagnostic.version !== 1 || !diagnostic.repository) {
    return jsonError("Deployment failure diagnostic was not found.", 404);
  }
  const repository = parseGitHubRepository(diagnostic.repository);
  if (!repository) return jsonError("Deployment failure diagnostic has an invalid repository.", 500);
  const allowed = await verifyGitHubRepoAccess({ token, owner: repository.owner, repo: repository.repo });
  if (!allowed) return jsonError("Bearer token is not authorized for this GitHub repository.", 401);
  return jsonSuccess({ diagnostic });
};

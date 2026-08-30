import { Hono, type Context } from "hono";
import type { Env } from "./env";
import { handleDeploy } from "./api/deploy";
import { handleRpc } from "./api/rpc";
import { handleQueueSend } from "./api/queues";
import { handleWorkflowCreate, handleWorkflowStatus } from "./api/workflows";
import { handleAiRun } from "./api/ai";
import { handleUsageGet } from "./api/usage";
import { handleLimitsGet } from "./api/limits";
import { handleAnalyticsGet } from "./api/analytics";
import { handleLogsGet } from "./api/logs";
import { handleStatusGet, handleStatusOptions } from "./api/status";
import {
  handleAgentDiscoveryGet,
  handleAgentManifestSchemaGet,
  handleAgentOpenApiGet,
  handleAgentRepoGet
} from "./api/agent";
import { json } from "./http";
import { handleQueueBatch } from "./runtime/queueDelivery";
import { handleScheduled } from "./runtime/scheduleDelivery";
import { handleEmail } from "./runtime/emailDelivery";
import { W7SWorkflow } from "./runtime/workflowDelivery";
import { resolveRuntimeRequest } from "./runtime/router";
import { landingHtml } from "./static/landing";
import { htmlIndexableHeaders, platformSeoResponse } from "./seo";
import { handleTailEvents } from "./logs";
import { enforceCookiePolicy } from "./security";
import { loadCustomDomainRouteMappings } from "./storage/deployments";
import { cleanHost, getBaseDomain, resolveRuntimeHost } from "./runtime/host";
import {
  handleDeployStatus,
  handleTelegramWebhook,
  handleTelegramWebhookInfo,
  notifyDeployResponse
} from "./notifications";

export { W7SWorkflow };

export const app = new Hono<{ Bindings: Env }>();

function optionalExecutionCtx(c: Context<{ Bindings: Env }>) {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

const resolveCustomDomainRuntimeRequest = async (c: Context<{ Bindings: Env }>) => {
  const request = c.req.raw;
  const url = new URL(request.url);
  const host = cleanHost(request.headers.get("host") || url.host);
  if (host === getBaseDomain(c.env) || resolveRuntimeHost(request, c.env)) return null;

  const customDomains = await loadCustomDomainRouteMappings(c.env, host, url.pathname);
  if (customDomains.length === 0) return null;

  return (
    await resolveRuntimeRequest(request, c.env, optionalExecutionCtx(c))
  ) ?? new Response("Not found.", { status: 404 });
};

app.use("*", async (c, next) => {
  await next();
  c.res = enforceCookiePolicy(c.res, c.env.W7S_BASE_DOMAIN);
});

app.use("*", async (c, next) => {
  const runtimeResponse = await resolveCustomDomainRuntimeRequest(c);
  if (runtimeResponse) return runtimeResponse;
  await next();
});

const health = (c: Context<{ Bindings: Env }>) =>
  json({
    status: "ok",
    service: "w7s-io",
    commitId: c.env.APP_COMMIT_ID ?? null,
    commitHash: c.env.APP_COMMIT_ID ?? null,
    branch: c.env.APP_DEPLOY_BRANCH ?? null,
    deployedAt: c.env.APP_DEPLOYED_AT ?? null
  });

app.get("/health", health);
app.get("/api/v1/health", health);
app.options("/api/v1/status", handleStatusOptions);
app.get("/api/v1/status", handleStatusGet);
app.get("/api/v1/agent/openapi.json", handleAgentOpenApiGet);
app.get("/api/v1/agent/manifest-schema", handleAgentManifestSchemaGet);
app.get("/api/v1/agent/repos/*", handleAgentRepoGet);

app.post("/api/v1/deploy", async (c) => {
  const response = await handleDeploy(c);
  const ctx = optionalExecutionCtx(c);
  const notification = notifyDeployResponse(c.env, c.req.raw, response.clone());
  if (ctx) ctx.waitUntil(notification);
  else await notification;
  return response;
});
app.post("/api/v1/deploy/status", handleDeployStatus);
app.all("/api/v1/rpc/*", handleRpc);
app.post("/api/v1/ai/run", handleAiRun);
app.post("/api/v1/queues/*", handleQueueSend);
app.post("/api/v1/workflows/*", handleWorkflowCreate);
app.get("/api/v1/workflows/*", handleWorkflowStatus);
app.get("/api/v1/usage/*", handleUsageGet);
app.get("/api/v1/limits/*", handleLimitsGet);
app.get("/api/v1/analytics/*", handleAnalyticsGet);
app.get("/api/v1/logs/*", handleLogsGet);
app.get("/api/v1/telegram/webhook", handleTelegramWebhookInfo);
app.post("/api/v1/telegram/webhook", handleTelegramWebhook);

app.all("*", async (c) => {
  const runtimeResponse = await resolveRuntimeRequest(c.req.raw, c.env, optionalExecutionCtx(c));
  if (runtimeResponse) return runtimeResponse;

  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    return c.notFound();
  }

  const path = new URL(c.req.url).pathname;
  if (path === "/agent.json" || path === "/.well-known/agent.json") {
    return handleAgentDiscoveryGet(c);
  }

  const seoResponse = platformSeoResponse(c.req.raw, c.env);
  if (seoResponse) return seoResponse;

  return new Response(c.req.method === "HEAD" ? null : landingHtml(), {
    status: 200,
    headers: htmlIndexableHeaders()
  });
});

export default {
  fetch: app.fetch,
  email: handleEmail,
  queue: handleQueueBatch,
  scheduled: handleScheduled,
  tail: handleTailEvents
};

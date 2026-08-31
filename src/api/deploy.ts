import type { Context } from "hono";
import { writeAnalyticsEvent } from "../analytics";
import type { Env } from "../env";
import { recordUsageEvent } from "../usage";
import { enforceUsageLimit } from "../usageEnforcement";
import { jsonError, jsonSuccess, parseBearerToken } from "../http";
import { parseGitHubRepository, verifyGitHubRepoAccess } from "../deploy/githubAuth";
import { readDeployArchive } from "../deploy/archive";
import { validateDeployLimits } from "../deploy/deployLimits";
import { isLimitExemptOrganization } from "../limitExemptions";
import {
  detectNativeWorkerRoots,
  detectWorkerEntrypoint,
  ENTRYPOINT_CANDIDATES,
  hasNativeWorkerRoot,
  NATIVE_ENTRYPOINT_REQUIREMENT,
  publishIsolateWorker
} from "../deploy/isolatePublisher";
import { hasStaticSite, publishStaticSite } from "../deploy/staticPublisher";
import { readAppManifest } from "../deploy/appManifest";
import { readDeployValues } from "../deploy/deployValues";
import { provisionAppBindings, storeDurableObjectClassRecords } from "../deploy/storageProvisioner";
import {
  buildRpcUploadBindings,
  generateRpcToken,
  hashRpcToken,
  W7S_RPC_BINDING
} from "../deploy/rpcBindings";
import {
  buildQueueUploadBindings,
  W7S_QUEUE_BINDING
} from "../deploy/queueBindings";
import {
  buildWorkflowUploadBindings,
  W7S_WORKFLOW_BINDING
} from "../deploy/workflowBindings";
import { buildAiUploadBindings, W7S_AI_BINDING } from "../deploy/aiBindings";
import { generateBindingToken, hashBindingToken } from "../deploy/tokens";
import { provisionAppQueues } from "../deploy/queueProvisioner";
import {
  attachCustomDomainRoutes,
  branchCustomDomain,
  customDomainRouteDisplay,
  planCustomDomainClaims,
  readCustomDomains
} from "../deploy/customDomains";
import { applicationScopedRepoSlug, buildDeploymentScriptName, buildStableScriptName, requireSlug, resolveEnvironment, sanitizeScriptPart } from "../names";
import {
  replaceCustomDomainMappings,
  replaceQueueMappings,
  replaceScheduleMappings,
  storeDeploymentRecord,
  type DeploymentRecord
} from "../storage/deployments";
import { enforceAppNotSuspended } from "../appLimits";
import { captureBillingReservation, refundBillingReservation, reserveBillingCredits, type BillingReservation } from "../billing";

type HonoContext = Context<{ Bindings: Env }>;

type DeployWarning = {
  code: "native_backend_skipped";
  target: string;
  message: string;
  requiredEntrypoints: string[];
};

const readHeader = (c: HonoContext, name: string) => c.req.header(name)?.trim() ?? "";

const requireHeader = (c: HonoContext, name: string) => {
  const value = readHeader(c, name);
  if (!value) throw new Error(`Missing ${name} header.`);
  return value;
};

const isZipRequest = (request: Request) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/zip") || contentType.includes("application/octet-stream");
};

const publicDeploymentUrl = (
  env: Env,
  orgSlug: string,
  repoSlug: string,
  environment: string,
  customDomains: string[]
) => {
  if (customDomains[0]) return `https://${customDomains[0]}/`;
  const baseDomain = env.W7S_BASE_DOMAIN?.trim() || "w7s.cloud";
  const host =
    environment === "production"
      ? `${orgSlug}.${baseDomain}`
      : `${sanitizeScriptPart(environment)}--${orgSlug}.${baseDomain}`;
  if (repoSlug === orgSlug) return `https://${host}/`;
  return `https://${host}/${repoSlug}/`;
};

const scriptTagPart = (value: string) =>
  sanitizeScriptPart(value).replace(/[^a-z0-9-]+/g, "-").slice(0, 48) || "unknown";

const buildScriptTags = (params: {
  environment: string;
  orgSlug: string;
  repoSlug: string;
}) => [
  "w7s",
  `w7s-env-${scriptTagPart(params.environment)}`,
  `w7s-owner-${scriptTagPart(params.orgSlug)}`,
  `w7s-repo-${scriptTagPart(params.repoSlug)}`,
  `w7s-app-${scriptTagPart(`${params.orgSlug}-${params.repoSlug}`)}`
];

const nativeEntrypointError = () =>
  `Native backend deploy requires ${NATIVE_ENTRYPOINT_REQUIREMENT}.`;

const nativeBackendSkippedWarning = (roots: string[]): DeployWarning => {
  const target = roots.join(", ") || "native backend";
  const label = roots.length > 0
    ? roots.map((root) => `${root}/`).join(", ")
    : "A native backend folder";
  return {
    code: "native_backend_skipped",
    target,
    message: `${label} was present, but W7S did not deploy a backend because no supported backend entrypoint was found. The frontend was published normally. Add ${NATIVE_ENTRYPOINT_REQUIREMENT} to deploy a backend.`,
    requiredEntrypoints: [...ENTRYPOINT_CANDIDATES]
  };
};

export const handleDeploy = async (c: HonoContext) => {
  const token = parseBearerToken(c.req.raw);
  if (!token) return jsonError("Missing bearer token.", 401);
  if (!isZipRequest(c.req.raw)) {
    return jsonError("Deploy body must be an application/zip archive.", 415);
  }

  let repositoryHeader: string;
  let commitSha: string;
  let branch: string;
  try {
    repositoryHeader = requireHeader(c, "x-github-repository");
    commitSha = requireHeader(c, "x-github-sha");
    branch = requireHeader(c, "x-github-branch");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }

  const repo = parseGitHubRepository(repositoryHeader);
  if (!repo) return jsonError("x-github-repository must be in owner/repo form.", 400);

  const orgSlug = requireSlug(repo.owner, "repository owner");
  const sourceRepoSlug = requireSlug(repo.repo, "repository name");
  let environment: string;
  try {
    environment = resolveEnvironment({
      branch,
      queryValue: c.req.query("environment"),
      headerValue: readHeader(c, "x-w7s-environment")
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }

  const allowed = await verifyGitHubRepoAccess({
    token,
    owner: repo.owner,
    repo: repo.repo
  });
  if (!allowed) {
    return jsonError("Bearer token is not authorized for this GitHub repository.", 401);
  }

  let archive;
  let appManifest;
  let deployValues;
  try {
    archive = await readDeployArchive(c.req.raw);
    appManifest = readAppManifest(archive);
    deployValues = readDeployValues(c);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }

  const headerApplication = readHeader(c, "x-w7s-application");
  let application: string;
  try {
    const normalizedHeaderApplication = headerApplication
      ? requireSlug(headerApplication, "application name")
      : "";
    if (normalizedHeaderApplication && appManifest.name && normalizedHeaderApplication !== appManifest.name) {
      return jsonError("x-w7s-application must match name in w7s.json.", 400);
    }
    application = appManifest.name || normalizedHeaderApplication || sourceRepoSlug;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
  const repoSlug = applicationScopedRepoSlug(sourceRepoSlug, application);

  const limitResponse = await enforceUsageLimit(c.env, {
    metric: "deploy",
    environment,
    orgSlug,
    repoSlug,
    units: 1
  });
  if (limitResponse) return limitResponse;

  const suspensionResponse = await enforceAppNotSuspended(c.env, {
    environment,
    orgSlug,
    repoSlug,
    request: c.req.raw
  });
  if (suspensionResponse) return suspensionResponse;

  const billingReservation = await reserveBillingCredits(c.env, {
    githubOwnerLogin: orgSlug,
    githubOwnerType: "org",
    operation: "deploy",
    amountCents: 100,
    idempotencyKey: `deploy:${environment}:${orgSlug}:${sourceRepoSlug}:${application}:${commitSha}`,
    metadata: {
      repository: repo.fullName,
      branch,
      commitSha,
      environment,
      application
    }
  });
  if (billingReservation instanceof Response) return billingReservation;

  const nativeRoots = detectNativeWorkerRoots(archive);
  const hasNativeRoot = hasNativeWorkerRoot(archive);
  const nativeEntrypoint = hasNativeRoot ? detectWorkerEntrypoint(archive) : null;
  const hasNativeBackend = Boolean(nativeEntrypoint);
  const hasStatic = hasStaticSite(archive, {
    allowAssetOnly: hasNativeBackend
  });
  const deploymentWarnings: DeployWarning[] = [];
  const customDomainsEnabled =
    appManifest.routing.customDomainBranchMode === "direct" || branch.trim() === "main";
  const branchCustomDomainPrefix = sanitizeScriptPart(branch);
  let customDomains: ReturnType<typeof readCustomDomains>;
  try {
    const declaredCustomDomains = readCustomDomains(
      archive,
      appManifest.routing.customDomainBranchMode === "direct"
        ? { branch: branchCustomDomainPrefix }
        : undefined
    );
    customDomains = customDomainsEnabled
      ? declaredCustomDomains
      : declaredCustomDomains.map((route) => branchCustomDomain(route, branchCustomDomainPrefix));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 400);
  }
  const defaultDomainEnabled = appManifest.routing.defaultDomain;
  if (!hasNativeBackend && !hasStatic) {
    if (hasNativeRoot) return jsonError(nativeEntrypointError(), 400);
    return jsonError("Archive must contain worker/, backend/, dist/server/, or static frontend output.", 400);
  }
  if (hasNativeRoot && !hasNativeBackend && hasStatic) {
    deploymentWarnings.push(nativeBackendSkippedWarning(nativeRoots));
  }
  if (!defaultDomainEnabled && customDomains.length === 0) {
    return jsonError("routing.defaultDomain=false requires at least one hostname in a CNAME file.", 400);
  }
  if (!hasNativeBackend && appManifest.queues.length > 0) {
    return jsonError("Queues require a native backend deployment.", 400);
  }
  if (!hasNativeBackend && appManifest.schedules.length > 0) {
    return jsonError("Schedules require a native backend deployment.", 400);
  }
  if (!hasNativeBackend && appManifest.workflows.length > 0) {
    return jsonError("Workflows require a native backend deployment.", 400);
  }
  if (!hasNativeBackend && appManifest.bindings.durableObjects.length > 0) {
    return jsonError("Durable Objects require a native backend deployment.", 400);
  }
  if (!hasNativeBackend && appManifest.bindings.hyperdrive.length > 0) {
    return jsonError("Hyperdrive bindings require a native backend deployment.", 400);
  }
  if (!hasNativeBackend && appManifest.bindings.email.length > 0) {
    return jsonError("Email bindings require a native backend deployment.", 400);
  }
  const deployLimitErrors = isLimitExemptOrganization(c.env, orgSlug)
    ? []
    : validateDeployLimits({
        archive,
        manifest: appManifest,
        customDomains,
        allowAssetOnly: hasNativeBackend
      });
  if (deployLimitErrors.length > 0) {
    return jsonError("Deploy exceeds W7S free-tier shape limits.", 400, {
      limits: deployLimitErrors
    });
  }

  const deployedAt = new Date().toISOString();
  const targets: DeploymentRecord["targets"] = {};
  let attachedCustomDomainRoutes: ReturnType<typeof readCustomDomains> = [];
  let attachedCustomDomains: string[] = [];
  let customDomainWarnings: Awaited<ReturnType<typeof planCustomDomainClaims>>["warnings"] = [];
  let blockedCustomDomains: Awaited<ReturnType<typeof planCustomDomainClaims>>["blocked"] = [];
  let deploymentBindings: DeploymentRecord["bindings"];
  let deploymentAi: DeploymentRecord["ai"];
  let deploymentRpc: DeploymentRecord["rpc"];
  let deploymentQueue: DeploymentRecord["queue"];
  let deploymentWorkflow: DeploymentRecord["workflow"];

  try {
    if (hasNativeBackend) {
      const entrypoint = detectWorkerEntrypoint(archive);
      if (!entrypoint) {
        return jsonError(nativeEntrypointError(), 400);
      }
      const usesDurableObjects = appManifest.bindings.durableObjects.length > 0;
      const scriptName = usesDurableObjects
        ? buildStableScriptName(orgSlug, repoSlug, environment)
        : buildDeploymentScriptName(orgSlug, repoSlug, environment, commitSha);
      const scriptTags = buildScriptTags({ environment, orgSlug, repoSlug });
      const provisionedBindings = await provisionAppBindings({
        env: c.env,
        archive,
        manifest: appManifest,
        deployValues,
        orgSlug,
        repoSlug,
        environment
      });
      deploymentBindings = provisionedBindings.deploymentBindings;
      const queues = await provisionAppQueues({
        env: c.env,
        manifest: appManifest,
        orgSlug,
        repoSlug,
        environment
      });
      const rpcToken = generateRpcToken();
      const rpcBindings = buildRpcUploadBindings({
        env: c.env,
        orgSlug,
        repoSlug,
        environment,
        token: rpcToken,
        sourceRepository: repo.fullName,
        application,
        branch,
        commitHash: commitSha,
        deployedAt
      });
      deploymentRpc = {
        binding: W7S_RPC_BINDING,
        tokenHash: await hashRpcToken(rpcToken),
        allow: appManifest.rpc.allow
      };
      const queueToken = generateBindingToken();
      const queueBindings = buildQueueUploadBindings({
        env: c.env,
        token: queueToken,
        declarations: appManifest.queues,
        queues
      });
      deploymentQueue = {
        binding: W7S_QUEUE_BINDING,
        tokenHash: await hashBindingToken(queueToken),
        allow: appManifest.queue.allow,
        queues
      };
      const workflowToken = generateBindingToken();
      const workflowBindings = buildWorkflowUploadBindings({
        env: c.env,
        token: workflowToken
      });
      deploymentWorkflow = {
        binding: W7S_WORKFLOW_BINDING,
        tokenHash: await hashBindingToken(workflowToken),
        allow: appManifest.workflow.allow,
        workflows: appManifest.workflows
      };
      const aiToken = generateBindingToken();
      const aiBindings = buildAiUploadBindings({
        env: c.env,
        token: aiToken
      });
      deploymentAi = {
        binding: W7S_AI_BINDING,
        tokenHash: await hashBindingToken(aiToken)
      };
      const published = await publishIsolateWorker({
        env: c.env,
        archive,
        scriptName,
        entrypoint,
        bindings: [
          ...provisionedBindings.uploadBindings,
          ...rpcBindings,
          ...queueBindings,
          ...workflowBindings,
          ...aiBindings
        ],
        durableObjectMigrations: provisionedBindings.durableObjectMigrations,
        tags: scriptTags
      });
      if (provisionedBindings.durableObjectMigrations) {
        await storeDurableObjectClassRecords({
          env: c.env,
          orgSlug,
          repoSlug,
          environment,
          classNames: provisionedBindings.durableObjectMigrations.classNames
        });
      }
      targets.worker = published;
    }

    if (hasStatic) {
      const publishedStatic = await publishStaticSite({
        env: c.env,
        archive,
        orgSlug,
        repoSlug,
        environment,
        commitSha,
        deployedAt,
        allowAssetOnly: hasNativeBackend
      });
      targets.static = {
        manifestKey: publishedStatic.manifestKey,
        assetPrefix: publishedStatic.manifest.assetPrefix,
        fileCount: Object.keys(publishedStatic.manifest.files).length,
        totalSize: Object.values(publishedStatic.manifest.files).reduce((total, file) => total + file.size, 0),
        hasIndex: publishedStatic.manifest.hasIndex
      };
    }

    if (customDomains.length > 0) {
      const customDomainPlan = await planCustomDomainClaims({
        env: c.env,
        routes: customDomains,
        orgSlug,
        repoSlug
      });
      attachedCustomDomainRoutes = customDomainPlan.attached;
      attachedCustomDomains = attachedCustomDomainRoutes.map(customDomainRouteDisplay);
      customDomainWarnings = customDomainPlan.warnings;
      blockedCustomDomains = customDomainPlan.blocked;
    }
  } catch (error) {
    await refundBillingReservation(c.env, billingReservation as BillingReservation | null);
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }

  if (!defaultDomainEnabled && attachedCustomDomains.length === 0) {
    await refundBillingReservation(c.env, billingReservation as BillingReservation | null);
    return jsonError("routing.defaultDomain=false requires an attached custom domain.", 400, {
      blockedCustomDomains
    });
  }

  const record: DeploymentRecord = {
    version: 1,
    orgSlug,
    repoSlug,
    sourceRepoSlug,
    application,
    environment,
    repository: repo.fullName,
    branch,
    commitSha,
    deployedAt,
    ...(attachedCustomDomains.length > 0 ? { customDomains: attachedCustomDomains } : {}),
    ...(!defaultDomainEnabled || appManifest.routing.customDomainAuthority
      ? { routing: appManifest.routing }
      : {}),
    ...(deploymentBindings ? { bindings: deploymentBindings } : {}),
    ...(deploymentAi ? { ai: deploymentAi } : {}),
    ...(deploymentRpc ? { rpc: deploymentRpc } : {}),
    ...(deploymentQueue ? { queue: deploymentQueue } : {}),
    ...(deploymentWorkflow ? { workflow: deploymentWorkflow } : {}),
    ...(appManifest.schedules.length > 0 ? { schedules: appManifest.schedules } : {}),
    targets
  };
  await storeDeploymentRecord(c.env, record);
  if (customDomainsEnabled) {
    await replaceCustomDomainMappings(c.env, record, attachedCustomDomainRoutes);
  } else {
    await replaceCustomDomainMappings(c.env, record, attachedCustomDomainRoutes, {
      staleHostnamePrefix: `${branchCustomDomainPrefix}--`
    });
  }
  await replaceQueueMappings(c.env, record, record.queue?.queues ?? []);
  await replaceScheduleMappings(c.env, record, record.schedules ?? []);
  if (attachedCustomDomains.length > 0) {
    try {
      await attachCustomDomainRoutes(c.env, attachedCustomDomainRoutes);
    } catch (error) {
      await refundBillingReservation(c.env, billingReservation as BillingReservation | null);
      return jsonError(error instanceof Error ? error.message : String(error), 500);
    }
  }

  writeAnalyticsEvent(c.env, {
    event: "deploy",
    repository: repo.fullName,
    environment,
    orgSlug,
    repoSlug,
    outcome: "success",
    source: hasNativeBackend && hasStatic ? "fullstack" : hasNativeBackend ? "backend" : "static",
    status: 200,
    count: targets.static?.fileCount ?? 1
  });
  await recordUsageEvent(c.env, {
    metric: "deploy",
    repository: repo.fullName,
    environment,
    orgSlug,
    repoSlug,
    outcome: "success",
    count: 1,
    units: 1
  });
  if (targets.static?.fileCount) {
    await recordUsageEvent(c.env, {
      metric: "static.r2_class_a",
      repository: repo.fullName,
      environment,
      orgSlug,
      repoSlug,
      outcome: "success",
      count: targets.static.fileCount,
      units: targets.static.fileCount,
      source: "w7s"
    });
  }

  await captureBillingReservation(c.env, billingReservation as BillingReservation | null);

  return jsonSuccess({
    deployment: {
      ...record,
      ...(record.ai ? { ai: { binding: record.ai.binding } } : {}),
      ...(record.rpc ? { rpc: { binding: record.rpc.binding, allow: record.rpc.allow } } : {}),
      ...(record.queue
        ? {
            queue: {
              binding: record.queue.binding,
              allow: record.queue.allow,
              queues: record.queue.queues
            }
          }
        : {}),
      ...(record.workflow
        ? {
            workflow: {
              binding: record.workflow.binding,
              allow: record.workflow.allow,
              workflows: record.workflow.workflows
            }
          }
        : {})
    },
    url: publicDeploymentUrl(
      c.env,
      orgSlug,
      repoSlug,
      environment,
      attachedCustomDomains
    ),
    ...(deploymentWarnings.length > 0 ? { deploymentWarnings } : {}),
    ...(attachedCustomDomains.length > 0 ? { customDomains: attachedCustomDomains } : {}),
    ...(customDomainWarnings.length > 0 ? { customDomainWarnings } : {}),
    ...(blockedCustomDomains.length > 0 ? { blockedCustomDomains } : {})
  });
};

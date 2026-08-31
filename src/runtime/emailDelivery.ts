import type { Env } from "../env";
import { applicationScopedRepoSlug } from "../names";
import { loadDeploymentRecord } from "../storage/deployments";
import { dispatchWorker } from "./dispatch";
import { resolveRuntimeRequest } from "./router";

type EmailGatewayTargetEnv = Pick<
  Env,
  | "W7S_EMAIL_GATEWAY_ORG"
  | "W7S_EMAIL_GATEWAY_REPO"
  | "W7S_EMAIL_GATEWAY_APPLICATION"
  | "W7S_EMAIL_GATEWAY_ENVIRONMENT"
>;

export const resolveEmailGatewayTarget = (env: EmailGatewayTargetEnv) => {
  const orgSlug = env.W7S_EMAIL_GATEWAY_ORG || "omattic";
  const sourceRepoSlug = env.W7S_EMAIL_GATEWAY_REPO || "inbox-gateway";
  const application = env.W7S_EMAIL_GATEWAY_APPLICATION;
  const environment = env.W7S_EMAIL_GATEWAY_ENVIRONMENT || "production";
  return {
    orgSlug,
    environment,
    repoSlug: applicationScopedRepoSlug(sourceRepoSlug, application),
  };
};

const routedHeaderNames = [
  "content-type",
  "x-omattic-workspace",
  "x-omattic-received-at",
  "x-omattic-envelope-from",
  "x-omattic-envelope-to",
  "x-omattic-raw-size",
  "x-omattic-signature"
] as const;

export const buildTenantEmailRequest = (response: Response) => {
  const workspace = response.headers.get("x-omattic-workspace")?.trim().toLowerCase() ?? "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(workspace)) return null;
  if (!response.body) return null;
  const headers = new Headers();
  for (const name of routedHeaderNames) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers,
    body: response.body,
    redirect: "manual",
    duplex: "half"
  };
  return new Request(
    `https://${workspace}.omattic.com/api/email/inbound/raw`,
    init
  );
};

export const handleEmail = async (message: ForwardableEmailMessage, env: Env) => {
  const { orgSlug, environment, repoSlug } = resolveEmailGatewayTarget(env);
  const deployment = await loadDeploymentRecord(env, environment, orgSlug, repoSlug);
  if (!deployment?.targets.worker) {
    message.setReject("Omattic email gateway is not deployed.");
    return;
  }

  const response = await dispatchWorker({
    env,
    request: new Request("https://inbox.omattic.com/_w7s/email", {
      method: "POST",
      headers: {
        "content-type": "message/rfc822",
        "x-w7s-email-from": message.from,
        "x-w7s-email-to": message.to,
        "x-w7s-email-raw-size": String(message.rawSize),
      },
      body: message.raw,
    }),
    repoPath: "/_w7s/email",
    repoSlug,
    orgSlug,
    scriptName: deployment.targets.worker.scriptName,
    urlHost: "inbox.omattic.com",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    console.error(JSON.stringify({ message: "email_gateway_dispatch_failed", status: response.status, detail }));
    message.setReject("Email could not be routed to the Omattic workspace.");
    return;
  }

  const tenantRequest = buildTenantEmailRequest(response);
  if (!tenantRequest) {
    console.error(JSON.stringify({ message: "email_gateway_invalid_envelope" }));
    message.setReject("Email could not be routed to the Omattic workspace.");
    return;
  }
  const tenantResponse = await resolveRuntimeRequest(tenantRequest, env);
  if (!tenantResponse?.ok) {
    const detail = tenantResponse ? (await tenantResponse.text()).slice(0, 300) : "Tenant route was not found.";
    console.error(JSON.stringify({
      message: "email_tenant_dispatch_failed",
      workspace: tenantRequest.headers.get("x-omattic-workspace"),
      status: tenantResponse?.status ?? 404,
      detail
    }));
    message.setReject("Email could not be routed to the Omattic workspace.");
  }
};

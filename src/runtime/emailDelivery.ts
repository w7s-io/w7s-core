import type { Env } from "../env";
import { applicationScopedRepoSlug } from "../names";
import { loadDeploymentRecord } from "../storage/deployments";
import { dispatchWorker } from "./dispatch";

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
  }
};

import type { Env } from "../env";
import type { WorkerUploadBinding } from "./workerBindings";
import { generateBindingToken, hashBindingToken } from "./tokens";

export const W7S_RPC_BINDING = "W7S_RPC";
export const W7S_RPC_TOKEN_BINDING = "W7S_RPC_TOKEN";

export const generateRpcToken = generateBindingToken;
export const hashRpcToken = hashBindingToken;

export const buildRpcUploadBindings = (params: {
  env: Env;
  orgSlug: string;
  repoSlug: string;
  environment: string;
  token: string;
  sourceRepository?: string;
  application?: string;
  branch?: string;
  commitHash?: string;
  deployedAt?: string;
}): WorkerUploadBinding[] => [
  {
    type: "service",
    name: W7S_RPC_BINDING,
    service: params.env.W7S_WORKER_NAME?.trim() || "w7s-io",
    environment: "production"
  },
  {
    type: "secret_text",
    name: W7S_RPC_TOKEN_BINDING,
    text: params.token
  },
  {
    type: "plain_text",
    name: "W7S_OWNER",
    text: params.orgSlug
  },
  {
    type: "plain_text",
    name: "W7S_REPO",
    text: params.repoSlug
  },
  {
    type: "plain_text",
    name: "W7S_REPOSITORY",
    text: `${params.orgSlug}/${params.repoSlug}`
  },
  {
    type: "plain_text",
    name: "W7S_ENVIRONMENT",
    text: params.environment
  },
  ...([
    ["W7S_SOURCE_REPOSITORY", params.sourceRepository],
    ["W7S_APPLICATION", params.application],
    ["W7S_BRANCH", params.branch],
    ["W7S_COMMIT_HASH", params.commitHash],
    ["W7S_DEPLOYED_AT", params.deployedAt],
    ["GIT_BRANCH", params.branch],
    ["GIT_COMMIT_HASH", params.commitHash],
    ["DEPLOYED_AT", params.deployedAt]
  ] as const)
    .flatMap(([name, text]): WorkerUploadBinding[] => text
      ? [{ type: "plain_text", name, text }]
      : [])
];

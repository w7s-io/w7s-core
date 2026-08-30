import type { Env } from "../env";
import type { WorkerUploadBinding } from "./workerBindings";
import type { QueueDeclaration } from "./appManifest";
import type { DeploymentQueue } from "../storage/deployments";

export const W7S_QUEUE_BINDING = "W7S_QUEUE";
export const W7S_QUEUE_TOKEN_BINDING = "W7S_QUEUE_TOKEN";

export const buildQueueUploadBindings = (params: {
  env: Env;
  token: string;
  declarations?: QueueDeclaration[];
  queues?: DeploymentQueue[];
}): WorkerUploadBinding[] => [
  {
    type: "service",
    name: W7S_QUEUE_BINDING,
    service: params.env.W7S_WORKER_NAME?.trim() || "w7s-io",
    environment: "production"
  },
  {
    type: "secret_text",
    name: W7S_QUEUE_TOKEN_BINDING,
    text: params.token
  },
  ...(params.declarations ?? []).flatMap((declaration): WorkerUploadBinding[] => {
    if (!declaration.binding) return [];
    const queue = params.queues?.find((candidate) => candidate.name === declaration.name);
    if (!queue) throw new Error(`Provisioned queue ${declaration.name} was not found.`);
    return [{ type: "queue", name: declaration.binding, queue_name: queue.queueName }];
  })
];

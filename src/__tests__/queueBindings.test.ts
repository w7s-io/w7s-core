import { describe, expect, it } from "vitest";
import { buildQueueUploadBindings } from "../deploy/queueBindings";

describe("queue producer bindings", () => {
  it("binds a declared native producer to its provisioned queue", () => {
    const bindings = buildQueueUploadBindings({
      env: {} as never,
      token: "token",
      declarations: [{ name: "email", consumer: "/_w7s/queues/email", binding: "EMAIL_QUEUE" }],
      queues: [{ name: "email", queueName: "managed-email", queueId: "queue-id", consumer: "/_w7s/queues/email" }],
    });
    expect(bindings).toContainEqual({ type: "queue", name: "EMAIL_QUEUE", queue_name: "managed-email" });
  });
});

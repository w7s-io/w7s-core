import { describe, expect, it } from "vitest";
import { parseCloudflareEnvelope, type CloudflareApiError } from "../deploy/cloudflareApi";

describe("Cloudflare API failures", () => {
  it("retains the status and Ray ID from a failed Cloudflare response", async () => {
    const response = Response.json(
      { success: false, errors: [{ message: "upstream provisioning failed" }] },
      { status: 503, headers: { "cf-ray": "a523-deploy-ASU" } }
    );

    await expect(parseCloudflareEnvelope(response)).rejects.toMatchObject({
      message: "upstream provisioning failed",
      status: 503,
      cfRay: "a523-deploy-ASU"
    } satisfies Partial<CloudflareApiError>);
  });
});

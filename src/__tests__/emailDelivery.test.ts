import { describe, expect, it } from "vitest";
import { applicationScopedRepoSlug } from "../names";
import { resolveEmailGatewayTarget } from "../runtime/emailDelivery";

describe("email gateway deployment target", () => {
  it("defaults to the standalone Omattic gateway production deployment", () => {
    expect(resolveEmailGatewayTarget({})).toEqual({
      orgSlug: "omattic",
      repoSlug: "inbox-gateway",
      environment: "production",
    });
  });

  it("keeps explicit application-scoped gateway overrides", () => {
    expect(
      resolveEmailGatewayTarget({
        W7S_EMAIL_GATEWAY_ORG: "example",
        W7S_EMAIL_GATEWAY_REPO: "communications",
        W7S_EMAIL_GATEWAY_APPLICATION: "gateway",
        W7S_EMAIL_GATEWAY_ENVIRONMENT: "staging",
      })
    ).toEqual({
      orgSlug: "example",
      repoSlug: applicationScopedRepoSlug("communications", "gateway"),
      environment: "staging",
    });
  });
});

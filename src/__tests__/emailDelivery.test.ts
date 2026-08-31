import { describe, expect, it } from "vitest";
import { applicationScopedRepoSlug } from "../names";
import { buildTenantEmailRequest, resolveEmailGatewayTarget } from "../runtime/emailDelivery";

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

  it("builds a tenant ingest request from the gateway envelope without a public fetch", async () => {
    const response = new Response("raw email", {
      status: 202,
      headers: {
        "content-type": "message/rfc822",
        "x-omattic-workspace": "inglesconliza",
        "x-omattic-received-at": "2026-08-31T01:00:00.000Z",
        "x-omattic-envelope-from": "sender@example.com",
        "x-omattic-envelope-to": "inglesconliza@mail.omattic.com",
        "x-omattic-raw-size": "9",
        "x-omattic-signature": "abc123",
        "x-untrusted": "drop-me"
      }
    });

    const request = buildTenantEmailRequest(response);

    expect(request?.url).toBe("https://inglesconliza.omattic.com/api/email/inbound/raw");
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("x-omattic-signature")).toBe("abc123");
    expect(request?.headers.get("x-untrusted")).toBeNull();
    expect(await request?.text()).toBe("raw email");
  });

  it("rejects an invalid workspace returned by the gateway", () => {
    expect(buildTenantEmailRequest(new Response("raw", {
      status: 202,
      headers: { "x-omattic-workspace": "../other" }
    }))).toBeNull();
  });
});

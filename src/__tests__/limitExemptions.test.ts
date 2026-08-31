import { describe, expect, it } from "vitest";
import { loadAppLimitState, suspendAppForLimits } from "../appLimits";
import { isLimitExemptOrganization } from "../limitExemptions";
import { checkRateLimit } from "../rateLimits";
import { recordUsageEvent } from "../usage";
import { checkUsageLimit } from "../usageLimits";
import { createTestEnv } from "./mocks";

describe("organization limit exemptions", () => {
  it("normalizes a comma-separated exempt organization list", () => {
    const env = createTestEnv({ W7S_LIMIT_EXEMPT_ORGS: " Omattic,example-org " });

    expect(isLimitExemptOrganization(env, "omattic")).toBe(true);
    expect(isLimitExemptOrganization(env, "EXAMPLE-ORG")).toBe(true);
    expect(isLimitExemptOrganization(env, "other")).toBe(false);
  });

  it("bypasses daily, burst, and suspension enforcement", async () => {
    const env = createTestEnv({ W7S_LIMIT_EXEMPT_ORGS: "omattic" });
    const target = {
      environment: "production",
      orgSlug: "omattic",
      repoSlug: "inbox"
    };

    await recordUsageEvent(env, {
      metric: "runtime.request",
      repository: "omattic/inbox",
      ...target,
      outcome: "success",
      count: 20_000,
      units: 20_000
    });

    await expect(checkUsageLimit(env, {
      metric: "runtime.request",
      ...target,
      units: 1
    })).resolves.toBeNull();
    await expect(checkRateLimit(env, {
      metric: "runtime.request",
      ...target,
      units: 1
    })).resolves.toBeNull();

    await suspendAppForLimits(env, {
      ...target,
      reason: "should not be stored",
      metrics: []
    });
    await expect(loadAppLimitState(env, target)).resolves.toBeNull();
  });
});

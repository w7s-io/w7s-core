import { describe, expect, it } from "vitest";
import { applicationScopedRepoSlug, branchToEnvironment, resolveEnvironment } from "../names";

describe("environment names", () => {
  it("maps production branches to production", () => {
    expect(branchToEnvironment("main")).toBe("production");
    expect(branchToEnvironment("master")).toBe("production");
    expect(branchToEnvironment("MAIN")).toBe("production");
  });

  it("normalizes branch names to DNS-safe environments", () => {
    expect(branchToEnvironment("Feature/API.v2_test")).toBe("feature-api-v2-test");
  });

  it("normalizes explicit environment overrides", () => {
    expect(
      resolveEnvironment({
        branch: "main",
        queryValue: "Review/API.v2_test"
      })
    ).toBe("review-api-v2-test");
  });
});

describe("application identities", () => {
  it("keeps legacy single-app repositories unchanged", () => {
    expect(applicationScopedRepoSlug("inbox", "inbox")).toBe("inbox");
    expect(applicationScopedRepoSlug("inbox")).toBe("inbox");
  });

  it("creates stable isolated identities for applications in one repository", () => {
    const consoleSlug = applicationScopedRepoSlug("inbox", "console");
    const apiSlug = applicationScopedRepoSlug("inbox", "support-api");
    expect(consoleSlug).toMatch(/^inbox-app-console-[a-z0-9]{7}$/);
    expect(apiSlug).toMatch(/^inbox-app-support-api-[a-z0-9]{7}$/);
    expect(consoleSlug).not.toBe(apiSlug);
    expect(applicationScopedRepoSlug("inbox", "console")).toBe(consoleSlug);
  });
});

import { describe, expect, it } from "vitest";
import { app } from "../worker";
import { createTestEnv } from "./mocks";
import { LANDING_DESCRIPTION } from "../seo";

const expectLandingHero = (body: string) => {
  expect(body).toMatch(/<section class="hero">[\s\S]*<h1>[\s\S]+<\/h1>/);
  expect(body).toMatch(/<p class="lede">\s*[\s\S]+?\s*<\/p>/);
  expect(body).toContain('<section class="terminal" aria-label="GitHub Actions deploy workflow">');
  expect(body).toContain('<p class="deploy-copy">');
  expect(body.indexOf("<pre><code>")).toBeLessThan(body.indexOf('<p class="deploy-copy">'));
};

describe("health endpoint", () => {
  it("exposes deploy metadata", async () => {
    const env = createTestEnv({
      APP_COMMIT_ID: "abc123",
      APP_DEPLOY_BRANCH: "main",
      APP_DEPLOYED_AT: "2026-05-23T19:31:42Z"
    });

    for (const path of ["/health", "/api/v1/health"]) {
      const response = await app.fetch(new Request(`https://w7s.cloud${path}`), env);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "ok",
        service: "w7s-io",
        commitId: "abc123",
        commitHash: "abc123",
        branch: "main",
        deployedAt: "2026-05-23T19:31:42Z"
      });
    }
  });
});

describe("landing page", () => {
  it("shows the minimal GitHub Actions deploy workflow", async () => {
    const response = await app.fetch(new Request("https://w7s.cloud/"), createTestEnv());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(body).toContain('<meta name="robots" content="index, follow" />');
    expect(body).toContain(`<meta name="description" content="${LANDING_DESCRIPTION}" />`);
    expect(body).toContain('<link rel="canonical" href="https://www.w7s.io/" />');
    expect(body).toContain('<meta property="og:title" content="W7S Cloud" />');
    expect(body).toContain('<meta name="twitter:card" content="summary" />');
    expect(body).toContain('<script type="application/ld+json">');
    expect(body).toContain("<title>W7S Cloud</title>");
    expectLandingHero(body);
    expect(body).toContain("https://www.w7s.io/docs/");
    expect(body).toContain("name: Deploy");
    expect(body).toContain("push:");
    expect(body).toContain("workflow_dispatch");
    expect(body).toContain("id-token: write");
    expect(body).toContain("w7s-io/w7s-cloud@v1");
    expect(body).toContain("© 2026 W7S SERVICES LLC");
    expect(body).toContain('href="https://w7s.io/terms"');
    expect(body).toContain('href="https://w7s.io/privacy"');
    expect(body).toContain('<strong class="workflow-action">w7s-io/w7s-cloud@v1</strong>');
    expect(body).not.toContain("token: ${{ github.token }}");
    expect(body).not.toContain("schedule:");
    expect(body).not.toContain("issues: write");
    expect(body).not.toContain("usage-check-only");
    expect(body).not.toContain("github.event_name == 'schedule'");
    expect(body).toContain("branches:");
    expect(body).not.toContain("install-command");
    expect(body).not.toContain("build-command");
  });

  it("shows W7S branded 404s for unresolved platform paths", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/missing", {
        headers: {
          "sec-fetch-mode": "navigate"
        }
      }),
      createTestEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<code>404 deployment_not_connected</code>");
    expect(body).toContain(
      "This W7S route is reachable, but there is no deployment attached to it yet."
    );
    expect(body).not.toContain("w7s.cloud/missing");
  });

  it("returns JSON for unresolved platform paths when requests are not navigations", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/missing", {
        headers: {
          "sec-fetch-mode": "cors"
        }
      }),
      createTestEnv()
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toMatchObject({
      status: "error",
      code: "deployment_not_connected",
      host: "w7s.cloud",
      path: "/missing"
    });
  });

  it("returns the indexable landing page for social preview crawlers on the default page", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/", {
        headers: {
          "user-agent": "Twitterbot/1.0"
        }
      }),
      createTestEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(body).toContain('<meta name="robots" content="index, follow" />');
  });

  it("serves platform robots and sitemap documents", async () => {
    const env = createTestEnv({
      APP_DEPLOYED_AT: "2026-05-23T19:31:42Z"
    });

    const robots = await app.fetch(new Request("https://w7s.cloud/robots.txt"), env);
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    await expect(robots.text()).resolves.toContain("Sitemap: https://www.w7s.io/sitemap.xml");

    const sitemap = await app.fetch(new Request("https://w7s.cloud/sitemap.xml"), env);
    const sitemapBody = await sitemap.text();
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    expect(sitemapBody).toContain("<loc>https://www.w7s.io/</loc>");
    expect(sitemapBody).toContain("<lastmod>2026-05-23T19:31:42.000Z</lastmod>");
  });
});

describe("status endpoint", () => {
  it("exposes a public component summary", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/status"),
      createTestEnv()
    );
    const body = await response.json() as {
      status: { description: string };
      components: Array<{ status: string }>;
      regions: Array<{ status: string }>;
      incidents: unknown[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body.status.description).toBe("All systems operational");
    expect(body.components).toHaveLength(12);
    expect(body.regions).toHaveLength(6);
    expect(body.components.every((component) => component.status === "operational")).toBe(true);
    expect(body.regions.every((region) => region.status === "operational")).toBe(true);
    expect(body.incidents).toHaveLength(0);
  });

  it("reports configured incidents and component overrides", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/status"),
      createTestEnv({
        W7S_STATUS_COMPONENTS_JSON: JSON.stringify({
          queues: "partial_outage"
        }),
        W7S_STATUS_INCIDENTS_JSON: JSON.stringify([
          {
            id: "incident-1",
            name: "Deploy queue latency",
            status: "investigating",
            impact: "minor",
            created_at: "2026-05-27T00:00:00.000Z",
            updated_at: "2026-05-27T00:01:00.000Z",
            components: ["queues"],
            component_names: ["Background queues"],
            incident_updates: [
              {
                status: "investigating",
                body: "Queue delivery is slower than expected.",
                created_at: "2026-05-27T00:01:00.000Z"
              }
            ]
          }
        ])
      })
    );
    const body = await response.json() as {
      status: { indicator: string; description: string };
      components: Array<{ id: string; name: string; status: string }>;
      incidents: Array<{ component_names: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.status.indicator).toBe("minor");
    expect(body.status.description).toBe("Partial outage detected");
    expect(body.components.find((component) => component.id === "queues")).toMatchObject({
      name: "Background queues",
      status: "partial_outage"
    });
    expect(body.incidents).toHaveLength(2);
    expect(body.incidents.flatMap((incident) => incident.component_names)).toContain(
      "Background queues"
    );
  });

  it("reports configured regional status overrides", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/status"),
      createTestEnv({
        W7S_STATUS_REGIONS_JSON: JSON.stringify({
          europe: "degraded_performance"
        })
      })
    );
    const body = await response.json() as {
      status: { indicator: string; description: string };
      regions: Array<{ id: string; name: string; status: string }>;
      incidents: Array<{ component_names: string[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.status.indicator).toBe("minor");
    expect(body.status.description).toBe("Some systems degraded");
    expect(body.regions.find((region) => region.id === "europe")).toMatchObject({
      name: "Europe",
      status: "degraded_performance"
    });
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0]?.component_names).toContain("Europe");
  });

  it("ignores malformed incident overrides", async () => {
    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/status"),
      createTestEnv({
        W7S_STATUS_INCIDENTS_JSON: JSON.stringify({ impact: "critical" })
      })
    );
    const body = await response.json() as {
      status: { description: string };
      incidents: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.status.description).toBe("All systems operational");
    expect(body.incidents).toHaveLength(0);
  });
});

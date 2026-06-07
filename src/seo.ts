import type { Env } from "./env";
import { cleanHost, getBaseDomain } from "./runtime/host";
import { NO_PREVIEW_ROBOTS, noPreviewHeaders } from "./noPreview";

export const LANDING_URL = "https://www.w7s.io/";
export const LANDING_TITLE = "W7S Cloud";
export const LANDING_DESCRIPTION =
  "W7S Cloud deploys static apps, JavaScript and TypeScript backends, queues, schedules, workflows, storage, and custom domains directly from GitHub Actions.";

const xmlEscape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const isPlatformHost = (request: Request, env: Pick<Env, "W7S_BASE_DOMAIN">) => {
  const url = new URL(request.url);
  const host = cleanHost(request.headers.get("host") || url.host);
  return host === getBaseDomain(env);
};

const textHeaders = (contentType: string) =>
  new Headers({
    "cache-control": "public, max-age=300",
    "content-type": contentType
  });

export const htmlIndexableHeaders = () => textHeaders("text/html; charset=utf-8");

export const platformRobotsResponse = (request: Request, env: Pick<Env, "W7S_BASE_DOMAIN">) => {
  const body = isPlatformHost(request, env)
    ? [
        "User-agent: *",
        "Allow: /",
        "Disallow: /api/",
        "Disallow: /api/v1/",
        `Sitemap: ${LANDING_URL}sitemap.xml`,
        ""
      ].join("\n")
    : [
        "User-agent: *",
        "Disallow: /",
        "# Undeployed W7S app placeholders are intentionally not indexed.",
        ""
      ].join("\n");

  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: isPlatformHost(request, env)
      ? textHeaders("text/plain; charset=utf-8")
      : noPreviewHeaders("text/plain; charset=utf-8")
  });
};

export const platformSitemapResponse = (
  request: Request,
  env: Pick<Env, "W7S_BASE_DOMAIN" | "APP_DEPLOYED_AT">
) => {
  if (!isPlatformHost(request, env)) {
    return new Response(request.method === "HEAD" ? null : "Sitemap not available.", {
      status: 404,
      headers: noPreviewHeaders("text/plain; charset=utf-8")
    });
  }

  const deployedAt = env.APP_DEPLOYED_AT?.trim();
  const lastmod = deployedAt && !Number.isNaN(Date.parse(deployedAt))
    ? new Date(deployedAt).toISOString()
    : undefined;
  const lastmodXml = lastmod ? `\n    <lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${xmlEscape(LANDING_URL)}</loc>${lastmodXml}
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: textHeaders("application/xml; charset=utf-8")
  });
};

export const platformSeoResponse = (
  request: Request,
  env: Pick<Env, "W7S_BASE_DOMAIN" | "APP_DEPLOYED_AT">
) => {
  const path = new URL(request.url).pathname;
  if (path === "/robots.txt") return platformRobotsResponse(request, env);
  if (path === "/sitemap.xml") return platformSitemapResponse(request, env);
  return null;
};

export const deployPlaceholderSeoResponse = (request: Request) => {
  const path = new URL(request.url).pathname;
  if (path === "/robots.txt") {
    return new Response(request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n", {
      status: 200,
      headers: noPreviewHeaders("text/plain; charset=utf-8")
    });
  }
  if (path === "/sitemap.xml") {
    return new Response(request.method === "HEAD" ? null : "Sitemap not available.", {
      status: 404,
      headers: noPreviewHeaders("text/plain; charset=utf-8")
    });
  }
  return null;
};

export const landingStructuredData = () =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "W7S Cloud",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cloudflare Workers",
    url: LANDING_URL,
    description: LANDING_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD"
    },
    publisher: {
      "@type": "Organization",
      name: "W7S SERVICES LLC",
      url: "https://w7s.io/"
    }
  });

export const noIndexMetaTags = () => `
    <meta name="robots" content="${NO_PREVIEW_ROBOTS}" />
    <meta name="googlebot" content="${NO_PREVIEW_ROBOTS}" />
    <meta name="bingbot" content="${NO_PREVIEW_ROBOTS}" />`;

export const landingMetaTags = () => `
    <meta name="robots" content="index, follow" />
    <meta name="description" content="${LANDING_DESCRIPTION}" />
    <link rel="canonical" href="${LANDING_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${LANDING_TITLE}" />
    <meta property="og:description" content="${LANDING_DESCRIPTION}" />
    <meta property="og:url" content="${LANDING_URL}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${LANDING_TITLE}" />
    <meta name="twitter:description" content="${LANDING_DESCRIPTION}" />
    <script type="application/ld+json">${landingStructuredData()}</script>`;

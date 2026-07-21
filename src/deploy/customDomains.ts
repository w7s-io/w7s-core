import type { DeployArchive } from "./archive";
import { readTextFile } from "./archive";
import type { Env } from "../env";
import { normalizeSlug } from "../names";
import { loadCustomDomainRouteMapping } from "../storage/deployments";

const CNAME_PATHS = [
  "CNAME",
  "frontend/CNAME",
  "frontend/dist/CNAME",
  "dist/client/CNAME",
  "dist/CNAME",
  "build/CNAME",
  "out/CNAME"
];
const DEFAULT_WORKER_NAME = "w7s-io";
const HOSTNAME_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const TXT_TOKEN_PATTERN =
  /^[a-z0-9](?:[a-z0-9._-]{0,99})(?:\/[a-z0-9](?:[a-z0-9._-]{0,99}))?$/;

export type CustomDomainWarning = {
  hostname: string;
  pathPrefix?: string;
  domain: string;
  txtName: string;
  txtValue: string;
  currentRepository?: string;
  message: string;
};

export type BlockedCustomDomain = {
  hostname: string;
  pathPrefix?: string;
  domain: string;
  reason: "txt_allowlist_mismatch";
  txtName: string;
  txtValue: string;
  currentRepository?: string;
  message: string;
};

export type CustomDomainPlan = {
  attached: CustomDomainRoute[];
  warnings: CustomDomainWarning[];
  blocked: BlockedCustomDomain[];
};

export type CustomDomainRoute = {
  hostname: string;
  pathPrefix: string;
};

export const customDomainRouteDisplay = (route: CustomDomainRoute) =>
  route.pathPrefix === "/" ? route.hostname : `${route.hostname}${route.pathPrefix}`;

const normalizePathPrefix = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  let pathname: string;
  try {
    pathname = new URL(`https://w7s.invalid${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`).pathname;
  } catch {
    throw new Error(`Invalid custom domain path in CNAME file: ${value}`);
  }
  const normalized = pathname.replace(/\/+$/g, "") || "/";
  if (
    normalized !== "/" &&
    (normalized.includes("//") || normalized.split("/").some((segment) => segment === "." || segment === ".."))
  ) {
    throw new Error(`Invalid custom domain path in CNAME file: ${value}`);
  }
  return normalized;
};

const normalizeCustomDomainRoute = (value: string): CustomDomainRoute | null => {
  let candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  let hostname: string;
  let pathPrefix = "/";
  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    hostname = url.hostname;
    pathPrefix = normalizePathPrefix(url.pathname);
  } else {
    const slashIndex = candidate.indexOf("/");
    hostname = slashIndex === -1 ? candidate : candidate.slice(0, slashIndex);
    pathPrefix = slashIndex === -1 ? "/" : normalizePathPrefix(candidate.slice(slashIndex));
  }
  hostname = hostname.replace(/\.$/, "");
  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new Error(`Invalid custom domain in CNAME file: ${value}`);
  }
  return { hostname, pathPrefix };
};

export const readCustomDomains = (archive: DeployArchive) => {
  const routes = new Map<string, CustomDomainRoute>();
  for (const path of CNAME_PATHS) {
    const text = readTextFile(archive, path);
    if (!text) continue;
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    for (const line of lines) {
      const route = normalizeCustomDomainRoute(line);
      if (route) routes.set(customDomainRouteDisplay(route), route);
    }
  }
  return [...routes.values()];
};

export const branchCustomDomain = (route: CustomDomainRoute, branchPrefix: string) => {
  const prefix = branchPrefix.trim().toLowerCase();
  const labels = route.hostname.split(".");
  const firstLabel = labels[0];
  if (!prefix || !firstLabel) {
    throw new Error(`Invalid branch custom domain for ${customDomainRouteDisplay(route)}.`);
  }
  labels[0] = `${prefix}--${firstLabel}`;
  const candidate = labels.join(".");
  if (!HOSTNAME_PATTERN.test(candidate)) {
    throw new Error(`Invalid branch custom domain ${candidate} derived from CNAME file.`);
  }
  return {
    hostname: candidate,
    pathPrefix: route.pathPrefix
  };
};

const cfRequest = async (env: Env, method: string, path: string, body?: unknown) => {
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is required to attach custom domains.");
  }
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      ...(body ? { "content-type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let parsed: { success?: boolean; result?: unknown; errors?: Array<{ message?: string }> } | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {}
  if (response.ok && parsed?.success !== false) return parsed?.result;
  const message =
    parsed?.errors?.map((entry) => entry?.message).filter(Boolean).join("; ") ||
    text ||
    `Cloudflare API request failed with ${response.status}`;
  const error = new Error(message);
  (error as Error & { status?: number }).status = response.status;
  throw error;
};

type Zone = {
  id?: string;
  name?: string;
};

type WorkerRoute = {
  id?: string;
  pattern?: string;
  script?: string | null;
  script_name?: string | null;
  scriptName?: string | null;
};

const findZoneForHostname = async (env: Env, hostname: string) => {
  const result = await cfRequest(env, "GET", "/zones?per_page=100");
  const zones = Array.isArray(result) ? (result as Zone[]) : [];
  const matches = zones
    .filter((zone) => zone.id && zone.name && (hostname === zone.name || hostname.endsWith(`.${zone.name}`)))
    .sort((a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0));
  const zone = matches[0];
  if (!zone?.id || !zone.name) {
    throw new Error(`Unable to find a Cloudflare zone for custom domain ${hostname}.`);
  }
  return { id: zone.id, name: zone.name };
};

const routeScriptName = (route: WorkerRoute) =>
  route.script || route.script_name || route.scriptName || null;

const verificationTxtName = (domain: string) => `_w7s.${domain}`;
const repoTxtValue = (orgSlug: string, repoSlug: string) => `${orgSlug}/${repoSlug}`;

const decodeDnsTxtData = (data: string) => {
  const chunks = [...data.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) =>
    (match[1] ?? "").replace(/\\(\d{3}|.)/g, (_all, escaped: string) =>
      /^\d{3}$/.test(escaped) ? String.fromCharCode(Number(escaped)) : escaped
    )
  );
  return chunks.length > 0 ? chunks.join("") : data.trim();
};

const parseTxtAllowlist = (values: string[]) =>
  [
    ...new Set(
      values
        .flatMap((value) => decodeDnsTxtData(value).split(","))
        .map((token) => token.trim().toLowerCase())
        .filter((token) => TXT_TOKEN_PATTERN.test(token))
    )
  ];

type DnsJsonAnswer = {
  type?: number;
  data?: string;
};

const lookupTxtAllowlist = async (txtName: string) => {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(txtName)}&type=TXT`;
    const response = await fetch(url, {
      headers: {
        accept: "application/dns-json"
      }
    });
    if (!response.ok) return { hasTxt: false, allowlist: [] as string[] };
    const payload = await response.json() as { Answer?: DnsJsonAnswer[] };
    const values = (payload.Answer ?? [])
      .filter((answer) => answer.type === 16 && typeof answer.data === "string")
      .map((answer) => answer.data as string);
    return {
      hasTxt: values.length > 0,
      allowlist: parseTxtAllowlist(values)
    };
  } catch {
    return { hasTxt: false, allowlist: [] as string[] };
  }
};

const isAuthorizedByAllowlist = (params: {
  allowlist: string[];
  orgSlug: string;
  repoSlug: string;
}) => {
  const repoEntry = repoTxtValue(params.orgSlug, params.repoSlug);
  return params.allowlist.includes(params.orgSlug) || params.allowlist.includes(repoEntry);
};

export const planCustomDomainClaims = async (params: {
  env: Env;
  routes: CustomDomainRoute[];
  orgSlug: string;
  repoSlug: string;
}) => {
  const plan: CustomDomainPlan = {
    attached: [],
    warnings: [],
    blocked: []
  };
  const orgSlug = normalizeSlug(params.orgSlug);
  const repoSlug = normalizeSlug(params.repoSlug);

  for (const route of params.routes) {
    const { hostname, pathPrefix } = route;
    const zone = await findZoneForHostname(params.env, hostname);
    const txtName = verificationTxtName(zone.name);
    const txtValue = repoTxtValue(orgSlug, repoSlug);
    const existing = await loadCustomDomainRouteMapping(params.env, hostname, pathPrefix);
    const sameRepo = existing?.orgSlug === orgSlug && existing.repoSlug === repoSlug;
    const txt = await lookupTxtAllowlist(txtName);

    if (txt.hasTxt) {
      if (isAuthorizedByAllowlist({ allowlist: txt.allowlist, orgSlug, repoSlug })) {
        plan.attached.push(route);
        continue;
      }
      plan.blocked.push({
        hostname,
        ...(pathPrefix !== "/" ? { pathPrefix } : {}),
        domain: zone.name,
        reason: "txt_allowlist_mismatch",
        txtName,
        txtValue,
        ...(existing?.repository ? { currentRepository: existing.repository } : {}),
        message: `TXT ${txtName} does not authorize ${txtValue}.`
      });
      continue;
    }

    plan.attached.push(route);
    plan.warnings.push({
      hostname,
      ...(pathPrefix !== "/" ? { pathPrefix } : {}),
      domain: zone.name,
      txtName,
      txtValue,
      ...(existing && !sameRepo ? { currentRepository: existing.repository } : {}),
      message:
        existing && !sameRepo
          ? `${hostname} replaced the unverified custom-domain claim by ${existing.repository}. Add TXT ${txtName}=${txtValue} to restrict future claims for this domain.`
          : `Add TXT ${txtName}=${txtValue} to restrict future claims for this domain.`
    });
  }

  return plan;
};

const customDomainRoutePattern = (route: CustomDomainRoute) =>
  route.pathPrefix === "/" ? `${route.hostname}/*` : `${route.hostname}${route.pathPrefix}*`;

export const attachCustomDomainRoutes = async (env: Env, routesToAttach: CustomDomainRoute[]) => {
  const workerName = env.W7S_WORKER_NAME?.trim() || DEFAULT_WORKER_NAME;
  const attached: Array<{ hostname: string; pattern: string; zoneId: string; zoneName: string }> = [];

  for (const route of routesToAttach) {
    const zone = await findZoneForHostname(env, route.hostname);
    const pattern = customDomainRoutePattern(route);
    const routesResult = await cfRequest(
      env,
      "GET",
      `/zones/${encodeURIComponent(zone.id)}/workers/routes?per_page=100`
    );
    const routes = Array.isArray(routesResult) ? (routesResult as WorkerRoute[]) : [];
    const existing = routes.find((route) => route.pattern === pattern);
    const existingScript = existing ? routeScriptName(existing) : null;

    if (existing?.id && existingScript && existingScript !== workerName) {
      await cfRequest(
        env,
        "DELETE",
        `/zones/${encodeURIComponent(zone.id)}/workers/routes/${encodeURIComponent(existing.id)}`
      );
    }

    if (!existing || existingScript !== workerName) {
      await cfRequest(
        env,
        "POST",
        `/zones/${encodeURIComponent(zone.id)}/workers/routes`,
        {
          pattern,
          script: workerName
        }
      );
    }

    attached.push({
      hostname: route.hostname,
      pattern,
      zoneId: zone.id,
      zoneName: zone.name
    });
  }

  return attached;
};

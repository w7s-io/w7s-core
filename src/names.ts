const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,99})$/i;
const ENVIRONMENT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export const normalizeSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9._-]+$/g, "");

export const requireSlug = (value: string, field: string) => {
  const slug = normalizeSlug(value);
  if (!slug || !SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid ${field}.`);
  }
  return slug;
};

export const normalizeEnvironmentSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");

export const requireEnvironmentSlug = (value: string, field = "environment") => {
  const slug = normalizeEnvironmentSlug(value);
  if (!slug || !ENVIRONMENT_PATTERN.test(slug)) {
    throw new Error(`Invalid ${field}.`);
  }
  return slug;
};

export const branchToEnvironment = (branch: string) => {
  const normalized = normalizeEnvironmentSlug(branch);
  if (!normalized || normalized === "main" || normalized === "master") {
    return "production";
  }
  return normalized;
};

export const resolveEnvironment = (params: {
  branch: string;
  queryValue?: string | null;
  headerValue?: string | null;
}) => {
  const override = (params.queryValue ?? params.headerValue ?? "").trim();
  if (override) return requireEnvironmentSlug(override);
  return branchToEnvironment(params.branch);
};

export const sanitizeScriptPart = (value: string) =>
  normalizeSlug(value).replace(/[._]+/g, "-") || "worker";

const shortIdentityHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0").slice(0, 7);
};

export const applicationScopedRepoSlug = (repoSlug: string, application?: string | null) => {
  const normalizedRepo = requireSlug(repoSlug, "repository name");
  const normalizedApplication = application?.trim()
    ? requireSlug(application, "application name")
    : "";
  if (!normalizedApplication || normalizedApplication === normalizedRepo) return normalizedRepo;
  const readable = sanitizeScriptPart(normalizedApplication).slice(0, 48).replace(/-+$/g, "");
  return `${normalizedRepo}-app-${readable}-${shortIdentityHash(`${normalizedRepo}\0${normalizedApplication}`)}`;
};

export const buildStableScriptName = (orgSlug: string, repoSlug: string, environment: string) =>
  `${sanitizeScriptPart(orgSlug)}--${sanitizeScriptPart(repoSlug)}--${sanitizeScriptPart(environment)}`;

export const buildDeploymentScriptName = (
  orgSlug: string,
  repoSlug: string,
  environment: string,
  commitSha: string
) =>
  `${buildStableScriptName(orgSlug, repoSlug, environment)}--${sanitizeScriptPart(commitSha.slice(0, 40))}`;

import type { Env } from "./env";
import { normalizeSlug } from "./names";

const configuredExemptOrganizations = (env: Env) =>
  new Set(
    (env.W7S_LIMIT_EXEMPT_ORGS ?? "")
      .split(",")
      .map((entry) => normalizeSlug(entry))
      .filter(Boolean)
  );

export const isLimitExemptOrganization = (env: Env, orgSlug: string) =>
  configuredExemptOrganizations(env).has(normalizeSlug(orgSlug));

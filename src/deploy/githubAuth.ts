export type GitHubRepo = {
  owner: string;
  repo: string;
  fullName: string;
};

type JsonRecord = Record<string, unknown>;

type GitHubOidcHeader = {
  alg?: string;
  kid?: string;
};

type GitHubOidcClaims = {
  aud?: string | string[];
  exp?: number;
  iss?: string;
  nbf?: number;
  repository?: string;
};

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
const GITHUB_OIDC_CLOCK_SKEW_SECONDS = 60;
const W7S_OIDC_AUDIENCES = new Set(["w7s.cloud", "https://w7s.cloud"]);

let githubOidcJwksCache:
  | {
      keys: JsonRecord[];
      expiresAt: number;
    }
  | null = null;

export const parseGitHubRepository = (value: string | null): GitHubRepo | null => {
  const raw = (value ?? "").trim();
  const match = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) return null;
  const owner = match[1] ?? "";
  const repo = match[2] ?? "";
  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`
  };
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const base64UrlJson = <T>(value: string): T => {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

const caseInsensitiveEqual = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

const isGitHubOidcAudience = (audience: string | string[] | undefined, owner: string) => {
  const values = Array.isArray(audience) ? audience : audience ? [audience] : [];
  const ownerAudience = `https://github.com/${owner}`;
  return values.some((value) => W7S_OIDC_AUDIENCES.has(value) || caseInsensitiveEqual(value, ownerAudience));
};

const fetchGitHubOidcJwks = async (fetchImpl: typeof fetch, forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && githubOidcJwksCache && githubOidcJwksCache.expiresAt > now) {
    return githubOidcJwksCache.keys;
  }

  const response = await fetchImpl(GITHUB_OIDC_JWKS_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "w7s-io-deploy"
    }
  });
  if (!response.ok) {
    throw new Error(`GitHub OIDC JWKS fetch failed (${response.status}).`);
  }

  const body = await response.json() as { keys?: JsonRecord[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  githubOidcJwksCache = {
    keys,
    expiresAt: now + 60 * 60 * 1000
  };
  return keys;
};

const importGitHubOidcKey = async (key: JsonRecord) =>
  crypto.subtle.importKey(
    "jwk",
    key,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

const verifyGitHubOidcToken = async (params: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl: typeof fetch;
}) => {
  const parts = params.token.split(".");
  if (parts.length !== 3) return null;

  let header: GitHubOidcHeader;
  let claims: GitHubOidcClaims;
  try {
    header = base64UrlJson<GitHubOidcHeader>(parts[0] ?? "");
    claims = base64UrlJson<GitHubOidcClaims>(parts[1] ?? "");
  } catch {
    return null;
  }

  if (claims.iss !== GITHUB_OIDC_ISSUER) return null;
  if (header.alg !== "RS256" || !header.kid) return false;

  let keys = await fetchGitHubOidcJwks(params.fetchImpl);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk && githubOidcJwksCache) {
    keys = await fetchGitHubOidcJwks(params.fetchImpl, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) return false;

  const key = await importGitHubOidcKey(jwk);
  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2] ?? "");
  const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
  if (!verified) return false;

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now - GITHUB_OIDC_CLOCK_SKEW_SECONDS) return false;
  if (typeof claims.nbf === "number" && claims.nbf > now + GITHUB_OIDC_CLOCK_SKEW_SECONDS) return false;
  if (!isGitHubOidcAudience(claims.aud, params.owner)) return false;

  const expectedRepository = `${params.owner}/${params.repo}`;
  if (typeof claims.repository !== "string" || !caseInsensitiveEqual(claims.repository, expectedRepository)) {
    return false;
  }

  return true;
};

export const verifyGitHubRepoAccess = async (params: {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}) => {
  const fetchImpl = params.fetchImpl ?? fetch;
  const oidcAllowed = await verifyGitHubOidcToken({
    token: params.token,
    owner: params.owner,
    repo: params.repo,
    fetchImpl
  });
  if (oidcAllowed !== null) return oidcAllowed;

  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${params.token}`,
        "user-agent": "w7s-io-deploy",
        "x-github-api-version": "2022-11-28"
      }
    }
  );

  if (response.ok) return true;
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return false;
  }

  const text = await response.text().catch(() => "");
  throw new Error(text.trim() || `GitHub authorization check failed (${response.status}).`);
};

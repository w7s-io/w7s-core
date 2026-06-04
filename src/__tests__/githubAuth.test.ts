import { describe, expect, it, vi } from "vitest";
import { verifyGitHubRepoAccess } from "../deploy/githubAuth";

const base64Url = (value: string | Uint8Array) => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const signedGitHubOidcToken = async (params: {
  kid: string;
  repository: string;
  audience?: string;
}) => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: params.kid, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    aud: params.audience ?? "w7s.cloud",
    exp: now + 300,
    iat: now,
    iss: "https://token.actions.githubusercontent.com",
    nbf: now - 10,
    repository: params.repository
  }));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, data));

  return {
    token: `${header}.${payload}.${base64Url(signature)}`,
    jwk: {
      ...publicJwk,
      kid: params.kid,
      alg: "RS256",
      use: "sig"
    }
  };
};

describe("GitHub repository authorization", () => {
  it("accepts a signed GitHub Actions OIDC token for the requested repository", async () => {
    const { token, jwk } = await signedGitHubOidcToken({
      kid: "oidc-valid",
      repository: "w7s-io/demo"
    });
    const fetchImpl = vi.fn(async () => Response.json({ keys: [jwk] }));

    await expect(
      verifyGitHubRepoAccess({
        token,
        owner: "w7s-io",
        repo: "demo",
        fetchImpl
      })
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://token.actions.githubusercontent.com/.well-known/jwks",
      expect.any(Object)
    );
  });

  it("rejects a signed GitHub Actions OIDC token for another repository", async () => {
    const { token, jwk } = await signedGitHubOidcToken({
      kid: "oidc-wrong-repo",
      repository: "w7s-io/other"
    });
    const fetchImpl = vi.fn(async () => Response.json({ keys: [jwk] }));

    await expect(
      verifyGitHubRepoAccess({
        token,
        owner: "w7s-io",
        repo: "demo",
        fetchImpl
      })
    ).resolves.toBe(false);
  });

  it("keeps the legacy GitHub API fallback for opaque bearer tokens", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ full_name: "w7s-io/demo" }));

    await expect(
      verifyGitHubRepoAccess({
        token: "github-token",
        owner: "w7s-io",
        repo: "demo",
        fetchImpl
      })
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/w7s-io/demo",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer github-token"
        })
      })
    );
  });
});

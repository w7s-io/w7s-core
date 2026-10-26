# Wildcard application domains

W7S supplies routing and namespace bindings. Applications own tenant registries,
authorization, SQL schemas, schema migrations, and business lifecycle operations.

## Declaration and routing

Put `*.example.com` in the application's existing `CNAME` file. Add `example.com`
separately for the apex. Wildcards match one label only: `customer.example.com`,
not `example.com` or `a.customer.example.com`. Only leftmost full wildcards and
root mounts are supported. Exact hosts take precedence, allowing a separate app
at `auth.example.com`. Exact path-only hosts remain reserved outside their paths.
W7S preserves the incoming URL hostname when dispatching to the application.
Applications must reject unregistered hostnames and authorize every object access.

## Authorization and provisioning

- The zone must be accessible to W7S's Cloudflare token. SaaS wildcard provisioning
  is deliberately unsupported in this version.
- Publish `_w7s.<zone>` TXT authorizing `org/repo` (the effective app-scoped repo
  slug for named applications). Organization-wide authorization is also supported
  but grants broader authority.
- Wildcards and new exact overrides beneath an existing wildcard require TXT
  authorization. Missing TXT and DNS lookup errors fail closed.
- Another application or environment cannot replace an existing wildcard claim.
  Release the old claim explicitly before transfer.
- Existing exact claims are preserved. Audit legacy unverified claims before rollout.
- W7S attaches the wildcard Worker route. DNS and TLS remain operator-managed:
  configure proxied wildcard DNS and a certificate covering the intended names.
  Attaching a Worker route alone does not create DNS or guarantee TLS coverage.
- W7S's platform domain cannot be claimed as an application wildcard.
- Non-main branches must use direct mode and a distinct domain, for example
  `*.preview.example.com`, with suitable TLS coverage. Automatic branch prefixing
  of wildcard declarations is rejected.

The registry uses existing eventually consistent KV storage, not a transactional
domain ownership lock. Serialize changes to the same domain. Concurrent authorized
first-time claims are not protected by global compare-and-swap.

## Dynamic SQLite objects

Declare an exported class once in `w7s.json`:

```json
{"bindings":{"durableObjects":[{"binding":"OBJECTS","className":"ObjectStore"}]}}
```

Application code selects instances with `env.OBJECTS.getByName(permanentId)`.
There is no per-instance deployment or business-entity API in W7S. Existing W7S
provisioning creates SQLite-backed classes and stable application/environment
script identities. SQL schema migrations belong to the application and are
separate from Cloudflare class migrations. Renaming a class, app, or environment
does not automatically transfer data. Class transfers and deletion remain manual.

## Verification and rollout

Run `npm ci` and `npm run check` on Node 22. Tests cover mocked provider calls,
runtime routing, real local SQLite isolation, eviction, code updates, restart,
and environment separation. Runtime tests use the renamed Cloudflare package,
`@cloudflare/vitest-plugin`, with a conservative fixture compatibility date.

Local tests do not prove hosted Workers for Platforms, DNS, TLS, or production
migrations. Before production activation:

1. Review and deploy W7S through the authorized release process.
2. Configure TXT, wildcard DNS, and TLS on a disposable domain. Deploy a generic
   app with two named objects and a separate exact-host app.
3. Write distinct values, redeploy changed code, and verify both values survive.
   Check exact-host precedence, application rejection of unregistered hosts, and
   preview isolation from production.
4. Verify platform and app health branch, commitHash, and deployedAt.
5. For routing rollback, remove the app's wildcard declaration and redeploy.
   DNS and Cloudflare routes may require operator cleanup. Do not delete object
   storage as part of routing rollback.

The test suite does not deploy or change live DNS.

### Hosted preflight evidence, 2026-10-26

The 195 local tests passed again. Read-only GitHub preflight run `40379014255`
confirmed DNS/certificate read access for the configured test zone. Its only
certificate covers the zone apex and first-level wildcard, not a nested test
wildcard. Hosted execution is pending a dedicated disposable domain or approval
for additional certificate setup. Broad routing over an existing product domain
was not used as a shortcut. No merge, production deployment, or DNS change occurred.

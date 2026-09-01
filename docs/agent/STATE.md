# W7S Core Agent State

## Current Runtime State

- W7S core routes deployed apps from default domains, repo-prefix paths, and custom domains.
- Runtime usage is accounted through `runtime.request` and app suspension is enforced by W7S cost guards.
- The `omattic` organization is exempt from W7S-owned daily, burst, suspension, and free-tier deployment-shape enforcement. Usage is still recorded for observability, and Cloudflare platform limits still apply.
- Production config generation must preserve `W7S_LIMIT_EXEMPT_ORGS`. The canonical Wrangler file alone is insufficient because GitHub Actions deploys `wrangler.generated.jsonc`; omitting the variable there causes stale or newly collected limit states to suspend otherwise exempt Omattic leaf applications.
- Short-window `runtime.request` limits can suspend apps when real application traffic exceeds policy.
- Scanner traffic against mapped custom domains can generate W7S-owned `not_found` 404 responses before the app runtime does useful work.

## Active Priorities

- Monorepo deployments can declare a stable `name` in each leaf `w7s.json`. W7S scopes every existing repository-based deployment surface through an effective application identity, so sibling folders do not overwrite each other.
- Permanent tenant branches can set `routing.customDomainBranchMode` to `direct` and `routing.defaultDomain` to `false`, attaching only their declared custom hostname without a generated `*.w7s.cloud` route. Direct-mode CNAME hostnames may contain `{branch}`, which resolves to the sanitized source branch so one tenant template can provision `demo.omattic.com`, `inglesconliza.omattic.com`, and later workspaces without branch-specific commits.
- Native deployments receive branch, full commit hash, deployment time, source repository, and application identity as W7S metadata bindings plus legacy health metadata aliases.
- Queue declarations may expose native producer bindings while W7S keeps isolated queue provisioning and HTTP consumer delivery.
- W7S Core dispatches Cloudflare Email Routing events to the standalone `omattic/inbox-gateway` production deployment by default, with environment overrides available when needed.
- The gateway returns a signed raw-envelope stream to W7S Core. Core resolves the tenant custom-domain path and dispatches the stream directly to the tenant Worker, avoiding a recursive public fetch during the Email Routing event.
- Public runtime routing returns 404 for `/_w7s/*`; queue, schedule, workflow, and email delivery reach those routes only through direct platform dispatch.
- Unresolved W7S runtime routes return a W7S-owned `deployment_not_connected` 404 instead of a generic Cloudflare or plain-text error. Browser navigations receive minimal HTML with only the error code and message, while non-navigation requests receive JSON.
- Native Workers whose `wrangler.json` declares `no_bundle: true` upload their complete JavaScript module tree. This preserves framework modules reached only through runtime `import()`, including Nitro SSR services and lazy route chunks.

- Keep custom-domain scanner noise from suspending customer apps when W7S returns cheap `not_found` 404 responses.
- Continue recording `runtime.request` telemetry for all routed requests, including scanner 404s.
- Preserve suspension behavior for actual app/workload traffic and non-rate policy enforcement.
- Keep platform health responses compatible with backend metadata expectations by exposing `branch`, `commitHash`, and `deployedAt`; `commitId` remains present for backward compatibility.
- Native backend manifests support Cloudflare Email Service send bindings through `bindings.email`, uploaded as Worker `send_email` bindings.
- `CNAME` entries can include path prefixes, such as `omattic.com/compress-video`; W7S strips that prefix before serving the app.
- Custom-domain path mappings are merged per hostname. A root hostname redeploy preserves sibling path routes from other repos, such as `www.omattic.com/compress-video`.
- Custom-domain path mappings also persist as independent v2 KV records keyed by hostname and path prefix. Runtime resolution merges these records with the legacy aggregate, preventing concurrent sibling deployments from losing one another through KV read-modify-write races.
- Front-door custom-domain authority is optional. Path routes work by default, and deploy responses warn when a path under a root hostname is not explicitly allowed by that root repo's `routing.customDomainAuthority`.
- ISO readiness planning for hosted W7S lives in `docs/iso/`.
- The first ISO asset and data inventory draft lives at `docs/iso/asset-and-data-inventory.md`.

## Known Incident Context

- `omattic/seokeywordexplorer-com` received a production suspension notification on 2026-07-11 because `runtime.request` hit the repo short-window policy at `300/300`.
- Live Analytics Engine data showed the burst was custom-domain scanner traffic on `www.seokeywordexplorer.com`, mostly `curl/8.7.1`, probing secret/admin paths and receiving `not_found:custom-domain` 404s.
- The deployed SEO Keyword Explorer commit already returned plain 404s for scanner paths; the remaining issue was W7S suspension enforcement counting cheap W7S-generated 404 bursts as suspendable app traffic.

# W7S Core Agent Runbook

## Local Verification

```sh
npm run check
```

## Monorepo Application Verification

Give every independently deployed folder a unique `w7s.json` name. Deploy through the reusable action with that folder as `working-directory`, then confirm the response includes `application` and `sourceRepoSlug` and that sibling applications have different deployment keys and Worker or static targets.

For a permanent tenant branch that must not use `w7s.cloud`, use:

```json
{
  "name": "support-api",
  "routing": {
    "defaultDomain": false,
    "customDomainBranchMode": "direct"
  }
}
```

Use a branch-derived custom domain in that app's `CNAME`:

```text
{branch}.omattic.com/api
```

Deploy branch `demo` and confirm the response attaches `demo.omattic.com/api`, not the literal placeholder or another tenant's hostname.

When several apps attach sibling paths on the same tenant hostname, deploy them concurrently and verify every path remains reachable after the last workflow finishes. Inspect `custom_domain_route:v2:<hostname>:` records when a path unexpectedly falls through to the root app; the legacy `custom_domain_routes:v1:<hostname>` aggregate is not the concurrency source of truth.

For framework-generated multi-module Workers, retain the generated `wrangler.json` beside the entrypoint and set `no_bundle: true`. W7S will upload every JavaScript module under that native root, including modules reachable only through dynamic imports. Verify both a lightweight route such as `/health` and an SSR route after deployment.

## Email Binding Verification

Deploy a native backend with:

```json
{
  "bindings": {
    "email": ["EMAIL"]
  }
}
```

Confirm the uploaded Worker metadata includes:

```json
{ "type": "send_email", "name": "EMAIL" }
```

The Cloudflare account must already have Email Service sending enabled for the sender domain. W7S only uploads the Worker binding.

## Usage Limit Investigation

GitHub Actions deploys `wrangler.generated.jsonc`, not the canonical Wrangler file. Before deploying an operator exemption change, confirm both the workflow environment and `scripts/prepare-cloudflare-config.mjs` carry `W7S_LIMIT_EXEMPT_ORGS` into the generated `vars` object.

List current app suspension state:

```sh
npx wrangler kv key list --namespace-id "$USAGE_KV_NAMESPACE_ID" --prefix "app_limit_state:v1:production:ORG:REPO" --remote
```

Read daily usage:

```sh
npx wrangler kv key get "usage_daily:v1:YYYY-MM-DD:production:ORG:REPO" --namespace-id "$USAGE_KV_NAMESPACE_ID" --remote
```

Read deployment metadata:

```sh
npx wrangler kv key get "deployment:v1:production:ORG:REPO" --namespace-id "$USAGE_KV_NAMESPACE_ID" --remote
```

Check for repo-specific usage policy overrides:

```sh
npx wrangler kv key list --namespace-id "$USAGE_KV_NAMESPACE_ID" --prefix "usage_limit_policy:v1:repo:ORG:REPO" --remote
```

## Analytics Engine Investigation

Query `w7s_platform_events` for `runtime_request` rows by repository, environment, source, host, path, status, and user agent. For scanner incidents, group by minute and user agent first, then inspect top paths.

## Deploy Verification

After deployment, verify backend metadata with:

```sh
curl -fsS https://w7s.io/health
```

The response must expose `branch`, `commitHash`, and `deployedAt`.

For shared Email Routing, point the routing rule at the W7S Core Worker. The default target is the `production` environment of `omattic/inbox-gateway`. Set `W7S_EMAIL_GATEWAY_ORG`, `W7S_EMAIL_GATEWAY_REPO`, `W7S_EMAIL_GATEWAY_APPLICATION`, or `W7S_EMAIL_GATEWAY_ENVIRONMENT` only when an alternate deployment is required.

W7S Core passes the single-use raw email stream to the gateway for workspace validation and signing. The gateway returns that signed stream, and Core resolves `https://<workspace>.omattic.com/api/email/inbound/raw` internally through the custom-domain route registry. Never make the gateway fetch that public hostname during the active email event.

## ISO Planning

The hosted W7S ISO readiness workspace is:

```sh
ls docs/iso
```

Start with:

```sh
sed -n '1,220p' docs/iso/execution-plan.md
```

For the first scoped inventory:

```sh
sed -n '1,260p' docs/iso/asset-and-data-inventory.md
```

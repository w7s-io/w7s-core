# W7S Core Agent Runbook

## Local Verification

```sh
npm run check
```

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

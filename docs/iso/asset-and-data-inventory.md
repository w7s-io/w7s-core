# Asset and Data Inventory

Status: draft.

Last updated: 2026-08-12.

Purpose: define the first scoped inventory for hosted W7S ISO 27001, ISO 27018, and ISO 27701 readiness. This document separates known production facts from items that still need live evidence.

## Inventory Rules

- Treat this as a living compliance artifact.
- Do not store secrets, tokens, raw customer data, or private customer content here.
- Every production asset needs an owner before readiness review.
- Every data category needs retention, access, and deletion expectations before audit.
- Evidence links should point to repo files, Cloudflare exports, GitHub exports, or vendor compliance evidence.

## Production Services

| Service | URL or identifier | Purpose | Owner | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| W7S Core | `w7s.cloud` | Hosted W7S deploy API, runtime router, app dispatch, usage protection, logs, custom domains, native bindings, queues, schedules, workflows, AI, and status endpoints. | TBD | In scope | `wrangler.jsonc`, `.github/workflows/deploy.yml`, `README.md` |
| Account W7S | `account.w7s.io` | Private billing authority for wallets, Stripe customers, prepaid credits, reservations, usage-event settlement, and Stripe webhook processing. | TBD | In scope | `/home/gnu/account-w7s-io/wrangler.jsonc`, `/home/gnu/account-w7s-io/docs/agent/STATE.md` |
| W7S Docs | `w7s.io` | Public product, docs, security, privacy, pricing, and user-facing trust material. | TBD | In scope | `/home/gnu/docs/docs/agent/STATE.md`, `/home/gnu/docs/.github/workflows/deploy.yml` |
| W7S Manager | internal manager repo | Durable W7S fleet context, worklogs, repo inventory, and Telegram binding metadata. | TBD | In scope for operating evidence | `/home/gnu/w7s-manager/docs/agent/STATE.md` |

## Production Repositories

| Repository | Local path | Purpose | Production role | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| `w7s-io/w7s-core` | `/home/gnu/w7s-core` | Hosted platform control plane and runtime. | Primary scoped system. | TBD | Confirmed |
| `w7s-io/account-w7s-io` | `/home/gnu/account-w7s-io` | Billing ledger and Stripe integration. | Supporting scoped system. | TBD | Confirmed |
| `w7s-io/docs` | `/home/gnu/docs` | Public docs and trust-facing content. | Supporting scoped system. | TBD | Confirmed |
| `w7s-io/w7s-manager` | `/home/gnu/w7s-manager` | Operational context, worklogs, and fleet inventory. | Evidence and operations support. | TBD | Confirmed |

Needs verification:

- Confirm GitHub organization teams and maintainers for each repo.
- Confirm branch protection and required checks on `main`.
- Confirm who can edit GitHub Actions secrets and variables.
- Confirm whether public docs should include security, privacy, subprocessors, and DPA pages before audit readiness.

## Cloudflare Assets

Known from `w7s-core/wrangler.jsonc`:

| Asset | Binding or name | Purpose | Data handled | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Worker | `w7s-io` | Hosted platform Worker for deploy API and runtime routing. | Deployment metadata, request metadata, logs, usage metadata, app dispatch traffic. | TBD | Confirmed |
| Custom domain | `w7s.cloud` | Primary hosted platform domain. | User requests and API requests. | TBD | Confirmed |
| Wildcard route | `*.w7s.cloud/*` | Default app routing under owner/repo paths. | Customer app request routing metadata and traffic. | TBD | Confirmed |
| Workers for Platforms Dispatch Namespace | `w7s-isolate` | User Worker upload and dispatch namespace. | Customer Worker scripts and runtime requests. | TBD | Confirmed |
| Workers KV | `DEPLOYMENTS_KV`, namespace id `8352f7268600497592a71a666b73ab1a` | Deployment records, static manifests, route mappings, usage rollups, app limit state, logs, binding token mappings, workflow activity state. | Platform metadata and operational telemetry. | TBD | Confirmed |
| R2 bucket | `w7s-io-static-assets` | Deployed frontend assets. | Customer static assets. | TBD | Confirmed |
| R2 preview bucket | `w7s-io-static-assets-preview` | Preview/static asset staging. | Customer static assets in preview context. | TBD | Confirmed |
| Workers AI binding | `AI` | Hosted AI model execution through W7S AI binding. | App prompts and model responses when apps use AI binding. | TBD | Confirmed |
| Analytics Engine | `W7S_ANALYTICS`, optional | Platform metrics, events, logs analytics, and usage investigation. | Request and platform event metadata. | TBD | Needs live binding confirmation |
| Cloudflare Workflows | `W7S_WORKFLOWS`, configured by generated deploy config | Durable workflow execution for app workflow instances. | Workflow payloads and execution metadata. | TBD | Needs live binding confirmation |
| Tail Worker | `w7s-io` as `W7S_LOG_TAIL_CONSUMER` | User Worker console and exception capture. | Runtime log events and exception metadata. | TBD | Confirmed by config |

Known from `account-w7s-io/wrangler.jsonc`:

| Asset | Binding or name | Purpose | Data handled | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Worker | `account-w7s-io` | Account and billing service. | Wallet, reservation, Stripe customer, usage-event, and webhook metadata. | TBD | Confirmed |
| Custom domain | `account.w7s.io` | Billing service endpoint. | Internal billing API traffic and Stripe webhook traffic. | TBD | Confirmed |
| D1 database | `account-w7s-io`, database id `07e415b0-3608-42bf-ba27-c67e331cb3c8` | Billing ledger and Stripe event store. | Billing data, wallet records, Stripe references, reservations, usage events. | TBD | Confirmed |

Needs verification:

- Export full Cloudflare resource inventory for the account.
- Confirm Cloudflare account members and roles.
- Confirm API tokens used by GitHub Actions, local deploys, and services.
- Confirm account-level audit log availability and retention.
- Confirm zone settings for `w7s.cloud` and `w7s.io`.

## GitHub Assets

| Asset | Purpose | Data handled | Owner | Status |
| --- | --- | --- | --- | --- |
| GitHub org `w7s-io` | Source control and CI/CD for scoped repos. | Source code, workflows, issues, PRs, Actions logs, secrets metadata. | TBD | Confirmed |
| GitHub Actions for `w7s-core` | Builds, tests, deploys, route reconciliation, Telegram deploy notifications. | Deploy metadata, workflow logs, secret references. | TBD | Confirmed |
| GitHub Actions for `account-w7s-io` | Typecheck, tests, D1 migrations, Worker deploy, health verification. | Deploy metadata, workflow logs, secret references. | TBD | Confirmed |
| GitHub Actions for `docs` | Builds and deploys public docs site. | Docs source, workflow logs, deploy metadata. | TBD | Confirmed |

Known `w7s-core` Actions secrets and variables from workflow references:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` or `ACCOUNT_ID`
- `W7S_TELEGRAM_BOT_TOKEN`
- `W7S_ADMIN_TELEGRAM_CHAT_ID`
- `W7S_TELEGRAM_CHAT_ID`
- `W7S_TELEGRAM_WEBHOOK_SECRET`
- `W7S_ZONE_NAME`
- `W7S_DEPLOYMENTS_KV_NAME`
- `W7S_STATIC_ASSETS_BUCKET`
- `W7S_DISPATCH_NAMESPACE`
- `W7S_ANALYTICS_DATASET`
- `W7S_WORKFLOW_NAME`
- `W7S_ATTACH_WILDCARD_ROUTE`
- `W7S_COMPATIBILITY_DATE`
- `W7S_STATUS_COMPONENTS_JSON`
- `W7S_STATUS_REGIONS_JSON`
- `W7S_STATUS_INCIDENTS_JSON`
- `W7S_TELEGRAM_EVENTS`

Needs verification:

- Export GitHub org membership and roles.
- Export repo collaborators and teams.
- Export branch protection rules.
- Export Actions secrets names, last updated timestamps, and owners if available.
- Confirm required status checks for production branches.

## Data Categories

| Category | Examples | System of record | Sensitivity | Retention status | Deletion status |
| --- | --- | --- | --- | --- | --- |
| GitHub identity metadata | Owner login, repo name, branch, commit SHA, actor claims from deploy OIDC. | W7S Core KV and deployment records. | Customer account metadata. | Needs final policy | Needs final procedure |
| Deployment metadata | Environment, Worker script name, static manifest, routes, bindings, custom domains, health metadata. | W7S Core KV and Cloudflare resources. | Customer app metadata. | Partial config: static retention 7 days, usage retention 14 days, script retention 7 days. | Needs final procedure |
| Customer static assets | Frontend files uploaded to R2. | R2 `w7s-io-static-assets`. | Customer content. | Partial config: `W7S_STATIC_RETENTION_DAYS=7`. | Needs final procedure |
| Customer Worker scripts | Uploaded native backend scripts. | Dispatch namespace `w7s-isolate`. | Customer code and possible embedded app logic. | Partial config: `W7S_WORKER_SCRIPT_RETENTION_DAYS=7`. | Needs final procedure |
| Runtime request metadata | Host, path, status, source, usage metric, user agent where logged. | KV usage rollups and optional Analytics Engine. | Operational telemetry. | Partial config: `W7S_USAGE_RETENTION_DAYS=14`. | Needs final procedure |
| User Worker logs | Console output and uncaught exception metadata. | KV `app_log:v1:*` records and optional Analytics Engine. | Potential customer data if apps log PII. | Partial config: `W7S_LOG_RETENTION_SECONDS=604800`. | Needs final procedure |
| Billing wallet data | GitHub owner login, owner type, wallet id, balance, ledger entries. | Account W7S D1. | Billing and account metadata. | Needs final policy | Needs final procedure |
| Stripe references | Stripe customer id, checkout session id, webhook event id, payment metadata. | Stripe and Account W7S D1. | Payment metadata. Card data stays in Stripe. | Needs final policy | Needs final procedure |
| Telegram notification metadata | Chat ids, deploy notification preferences, manager event metadata. | W7S Core KV and manager context. | Operational contact data. | Needs final policy | Needs final procedure |
| AI prompts and outputs | Requests to W7S AI binding and model responses when used by apps. | Runtime path, optional logs if app logs them. | Potential customer content or PII. | Needs final policy | Needs final procedure |
| Email binding metadata | Email binding declarations and allowed sender/destination restrictions. | Deployment records and Worker upload metadata. | Configuration metadata. | Needs final policy | Needs final procedure |

## Data Flow Inventory

### Deploy Flow

1. GitHub Actions obtains or provides repository authorization.
2. Deploy request reaches `w7s.cloud`.
3. W7S verifies GitHub repository access.
4. W7S reads deployment archive and `w7s.json`.
5. W7S provisions or reuses Cloudflare resources.
6. Static assets are stored in R2.
7. Worker scripts are uploaded to the dispatch namespace.
8. Deployment metadata and route mappings are stored in KV.
9. Optional Telegram notifications are sent.
10. If billing is enabled, W7S calls `account.w7s.io` for reservation, capture, refund, or usage reporting.

Data categories: GitHub repo metadata, deployment metadata, customer static assets, customer Worker scripts, route metadata, billing metadata, notification metadata.

### Runtime Request Flow

1. Request reaches `w7s.cloud`, wildcard `*.w7s.cloud`, or a custom domain route.
2. W7S resolves the deployment from KV route metadata.
3. W7S checks app suspension and usage limits.
4. Static requests are served from R2 or backend requests are dispatched through the dispatch namespace.
5. Usage events are recorded in KV and optional Analytics Engine.
6. Logs may be captured through Tail Worker behavior.

Data categories: request metadata, customer app traffic, customer static assets, usage metadata, app logs.

### Billing Flow

1. W7S core calls `account.w7s.io` internal endpoints when billing is enabled.
2. Account W7S ensures a wallet, creates Stripe Checkout sessions, receives Stripe webhooks, and records ledger entries.
3. Stripe hosts card collection and payment processing.
4. Account W7S D1 stores wallet, ledger, reservation, usage-event, and Stripe webhook event metadata.

Data categories: billing wallet data, Stripe references, usage events, payment metadata.

### Notification Flow

1. W7S core emits operational events for deploys, warnings, errors, app suspensions, usage collection failures, and payment requests.
2. Telegram bot sends configured notifications to manager/admin or repo-linked chats.
3. Telegram chat ids and notification subscriptions may be stored as operational contact metadata.

Data categories: Telegram chat ids, repository metadata, event metadata.

## Subprocessors And Vendors

| Vendor | Role | Data processed | Current evidence status |
| --- | --- | --- | --- |
| Cloudflare | Hosting, Workers, D1, KV, R2, Workers for Platforms, AI, Analytics, Email Service. | Platform metadata, app traffic, customer content, logs, usage metadata, billing service data. | Need annual compliance evidence collection |
| GitHub | Source control, GitHub Actions, OIDC auth, CI/CD. | Source code, deploy metadata, Actions logs, repo identity metadata. | Need annual compliance evidence collection |
| Stripe | Payment processor and Checkout host. | Payment metadata, Stripe customer records, checkout session metadata. | Need annual compliance evidence collection |
| Telegram | Operational notifications. | Chat ids and notification message content. | Need vendor review and data minimization decision |

## Initial Control Owners

These are placeholders until Phase 0 owner assignment is approved.

| Control area | Proposed owner | Status |
| --- | --- | --- |
| Compliance program | TBD | Needed |
| W7S Core technical controls | TBD | Needed |
| Account W7S billing controls | TBD | Needed |
| Public docs and trust pages | TBD | Needed |
| Cloudflare access and resources | TBD | Needed |
| GitHub access and branch protection | TBD | Needed |
| Stripe access and billing controls | TBD | Needed |
| Incident response | TBD | Needed |
| Privacy and data retention | TBD | Needed |

## Open Questions

1. Who is the named compliance owner for the ISO program?
2. Who is the named privacy owner for ISO 27701 decisions?
3. What is the target audit window?
4. Where should restricted audit evidence live?
5. Which customers or prospects require certification versus readiness evidence?
6. Should Telegram remain in scope for operational notifications, or should sensitive notifications move to a more controlled channel?
7. What is the exact customer deletion SLA?
8. What is the exact log retention policy for app logs, platform events, and billing logs?
9. Are customer Worker scripts considered customer content for deletion and export commitments?
10. Which Cloudflare AI models and data handling terms apply to W7S AI binding traffic?

## Next Actions

1. Assign owners for every row marked `TBD`.
2. Export GitHub organization and repo access evidence.
3. Export Cloudflare account members, zones, Workers, D1, KV, R2, dispatch namespace, and token inventory.
4. Export Stripe account users, webhook configuration, and product/payment configuration.
5. Decide evidence storage location and access rules.
6. Turn this inventory into diagrams for deploy, runtime, billing, and notification flows.

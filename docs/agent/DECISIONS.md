# W7S Core Agent Decisions

## 2026-08-30: Leaf Manifests Own Application Identity

Second-level deployable folders may each contain a `w7s.json` with a stable `name`. The deployment API validates the `x-w7s-application` action header against that manifest name and derives an isolated internal identity from the source repository plus application.

All existing repository-scoped systems reuse that isolated identity, including Worker scripts, static assets, managed resources, queues, schedules, workflows, custom-domain mappings, usage, logs, suspension state, and cleanup. Repositories without a manifest name keep their legacy identity.

Permanent tenant branches may opt into direct custom domains with `routing.customDomainBranchMode: "direct"`. The default remains branch-prefixed custom domains for backward compatibility.

W7S injects `W7S_BRANCH`, `W7S_COMMIT_HASH`, `W7S_DEPLOYED_AT`, `W7S_SOURCE_REPOSITORY`, and `W7S_APPLICATION` into native deployments. It also injects `GIT_BRANCH`, `GIT_COMMIT_HASH`, and `DEPLOYED_AT` aliases so migrated Workers expose complete health metadata without repository-specific deploy wrappers.

## 2026-07-12: Scanner Not-Found Bursts Do Not Suspend Apps

W7S records all routed requests as usage, including W7S-generated `not_found` 404 responses on mapped custom domains.

For short-window rate enforcement only, W7S suppresses app suspension for:

- `static_fallback`
- `not_found`

Rationale: these responses are cheap platform-generated outcomes commonly caused by external scanners. They should remain visible in telemetry and usage counters, but they should not make a customer app unavailable when no customer runtime work is being performed.

Non-rate policy enforcement and real app traffic remain suspendable.

## 2026-07-16: Email Service Bindings Are Native Backend Runtime Bindings

W7S supports Cloudflare Email Service send bindings through `bindings.email` in `w7s.json`.

Declarations are uploaded as Worker metadata bindings with `type: "send_email"`. W7S passes through optional binding restrictions:

- `destinationAddress`
- `allowedDestinationAddresses`
- `allowedSenderAddresses`

W7S does not onboard Email Service sending domains. The Cloudflare account must already have sending enabled for the sender domain before app code calls `env.EMAIL.send(...)`.

## 2026-07-21: CNAME Supports Path-Based Custom Routes

W7S accepts CNAME entries as either host-only routes or host plus path-prefix routes.

Examples:

- `www.example.com`
- `omattic.com/compress-video`

Path routes attach Cloudflare Worker routes like `omattic.com/compress-video*` and store path-aware KV route mappings. At runtime, W7S chooses the longest matching path prefix for the hostname and strips that prefix before dispatching to the app, so the target app can keep normal root-relative routes and assets.

## 2026-08-10: Front-Door Path Authority Is Advisory By Default

W7S keeps path-based custom-domain routing low-friction. A repo can attach a path route under a hostname owned by another repo without a blocking front-door policy, so existing deployments continue to work by default.

Root hostname repos can declare `routing.customDomainAuthority` in `w7s.json` to explicitly allow delegated path prefixes by repository. When a path route is not covered by that optional authority, the deploy response returns a warning instead of blocking the deployment.

Rationale: W7S should support an Omattic-style root site that acts as the security front door for path-mounted tools, but guard adoption should be incremental. Warnings promote the safer topology without breaking path routing during migration.

## 2026-08-11: ISO Readiness Plan Lives In W7S Core

The ISO 27001, ISO 27018, and ISO 27701 readiness planning workspace lives under `docs/iso/` in `w7s-core`.

Rationale: the plan is directly about hosted W7S core platform compliance and should live in the primary platform repository.

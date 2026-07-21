# W7S Core Agent Decisions

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

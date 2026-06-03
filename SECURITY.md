# W7S Cloud Security Controls

This document tracks the cloud-side controls for reducing cross-subdomain risk on
`*.w7s.cloud`. Every subdomain under `*.w7s.cloud` is an organization tenant.
Tenants are mutually untrusted and each tenant maps to a different GitHub
organization.

There are no reserved `admin.w7s.cloud`, `api.w7s.cloud`, or shared app
subdomains inside this namespace. Any privileged W7S-operated control plane
should live outside the tenant wildcard namespace.

## Cookie Policy

Authentication and sensitive browser state must use host-only cookies. Do not set
cookies with either of these domain attributes:

```http
Domain=.w7s.cloud
Domain=w7s.cloud
```

Tenant cookies should use the `__Host-` prefix:

```http
Set-Cookie: __Host-session=...; Path=/; Secure; HttpOnly; SameSite=Lax
```

The Worker enforces the parent-domain portion of this policy by removing
`Set-Cookie` headers scoped to the configured `W7S_BASE_DOMAIN`.

## Cookie Bombing

Tenant hosts should reject oversized cookie headers before requests reach origin
code.

Recommended threshold:

```text
<org>.w7s.cloud: 8 KB Cookie header
```

For tenant hosts, maintain a small allowlist of expected platform cookies when
the platform controls cookie names:

```text
__Host-session
__Host-csrf
tenant_pref
```

Requests with unexpectedly large cookie headers or excessive cookie counts
should be logged and blocked at the edge.

## Security Headers

Every tenant subdomain should send a baseline header set:

```http
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Roll out CSP changes in `Report-Only` mode first for existing apps, then enforce
after violations have been reviewed.

## XSS Controls

Cloudflare Managed WAF rules should be enabled for tenant hosts. Add custom WAF
rules for high-risk routes that process user-controlled HTML, markdown,
templates, query strings, or redirects.

Application code must still escape output and sanitize any intentional HTML
input. Edge rules are a compensating control, not the primary XSS defense.

## API Request Boundaries

State-changing tenant requests should validate both origin and CSRF protections
when browser cookies are involved.

Edge policy:

```text
If method is POST, PUT, PATCH, or DELETE
and Origin is present
and Origin does not exactly match the tenant origin
then block.
```

Prefer bearer tokens or signed requests for non-browser automation APIs.

## Subdomain Trust Zones

Treat every tenant subdomain as a separate trust boundary. Sibling subdomains are
not trusted, even though they share the `w7s.cloud` parent domain.

Actual namespace model:

```text
w7s.cloud        marketing/root
<org>.w7s.cloud  mutually untrusted organization tenant
```

Tenant hosts must not receive parent-domain cookies and must not depend on
parent-domain state. A tenant must never be able to affect authentication,
storage, routing, or request handling for another tenant.

If a tenant needs internal roles such as admin, API, uploads, or previews, model
those as tenant-owned paths or use a separate non-`w7s.cloud` content domain.
Do not create shared `admin`, `api`, or `uploads` hosts in the tenant wildcard
namespace.

## User Content Isolation

Untrusted uploads should be served from a separate site that has no privileged
cookies or application storage.

Preferred:

```text
w7susercontent.com
```

If uploaded content must be served from a tenant origin, enforce a restrictive
CSP, avoid auth cookies for content responses, force downloads for risky MIME
types, and send `X-Content-Type-Options: nosniff`.

## Storage Poisoning

Browser storage is origin-scoped, but any script that runs on the origin can
modify `localStorage`, `sessionStorage`, and IndexedDB.

Controls:

- Do not host multiple organizations on the same tenant hostname.
- Do not store long-lived auth tokens in browser storage.
- Validate and version data loaded from browser storage.
- Keep tenant-controlled application and uploaded-content surfaces on separate
  origins when users can upload scriptable content.

## Observability

Log and alert on:

- blocked parent-domain `Set-Cookie` attempts
- large `Cookie` headers
- excessive cookie counts
- CSP violations
- WAF XSS matches
- state-changing requests with unexpected origins
- tenant upload/content hosts attempting to set cookies

Cloudflare Logpush should forward these events to the central logging system
when available.

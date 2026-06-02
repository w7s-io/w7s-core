# W7S Cloud Security Controls

This document tracks the cloud-side controls for reducing cross-subdomain risk on
`*.w7s.cloud`.

## Cookie Policy

Authentication and sensitive browser state must use host-only cookies. Do not set
cookies with either of these domain attributes:

```http
Domain=.w7s.cloud
Domain=w7s.cloud
```

Sensitive cookies should use the `__Host-` prefix:

```http
Set-Cookie: __Host-session=...; Path=/; Secure; HttpOnly; SameSite=Lax
```

Admin sessions should prefer `SameSite=Strict` when the login flow allows it.

The Worker enforces the parent-domain portion of this policy by removing
`Set-Cookie` headers scoped to the configured `W7S_BASE_DOMAIN`.

## Cookie Bombing

Sensitive hosts should reject oversized cookie headers before requests reach
origin code.

Recommended thresholds:

```text
admin.w7s.cloud: 4 KB Cookie header
app.w7s.cloud:   8 KB Cookie header
```

For privileged hosts, maintain a small allowlist of expected cookies such as:

```text
__Host-session
__Host-csrf
app_pref
admin_pref
```

Requests with unexpectedly large cookie headers or excessive cookie counts
should be logged and blocked at the edge.

## Security Headers

Every app subdomain should send a baseline header set:

```http
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Roll out CSP changes in `Report-Only` mode first for existing apps, then enforce
after violations have been reviewed.

## XSS Controls

Cloudflare Managed WAF rules should be enabled for application hosts. Add custom
WAF rules for high-risk routes that process user-controlled HTML, markdown,
templates, query strings, or redirects.

Application code must still escape output and sanitize any intentional HTML
input. Edge rules are a compensating control, not the primary XSS defense.

## API Request Boundaries

State-changing API requests should validate both origin and CSRF protections
when browser cookies are involved.

Edge policy:

```text
If method is POST, PUT, PATCH, or DELETE
and Origin is present
and Origin is not an allowed W7S origin
then block.
```

Prefer bearer tokens or signed requests for non-browser automation APIs.

## Subdomain Trust Zones

Treat every subdomain as a separate trust boundary unless it is owned and
operated as part of the same app.

Suggested classification:

```text
w7s.cloud               marketing/root
app.w7s.cloud           trusted app
admin.w7s.cloud         privileged admin
api.w7s.cloud           API
preview-*.w7s.cloud     semi-trusted previews
uploads.w7s.cloud       untrusted content
customer subdomains     untrusted tenants
```

Preview, customer, and uploaded-content hosts must not receive production auth
cookies and must not depend on parent-domain state.

## User Content Isolation

Untrusted uploads should be served from a separate site that has no privileged
cookies or application storage.

Preferred:

```text
w7susercontent.com
```

Fallback:

```text
uploads.w7s.cloud
```

If the fallback is used, enforce a restrictive CSP, avoid auth cookies entirely,
force downloads for risky MIME types, and send `X-Content-Type-Options:
nosniff`.

## Storage Poisoning

Browser storage is origin-scoped, but any script that runs on the origin can
modify `localStorage`, `sessionStorage`, and IndexedDB.

Controls:

- Do not host mutually untrusted tenants on the same hostname.
- Do not store long-lived auth tokens in browser storage.
- Validate and version data loaded from browser storage.
- Keep admin, app, preview, and uploaded-content surfaces on separate origins.

## Observability

Log and alert on:

- blocked parent-domain `Set-Cookie` attempts
- large `Cookie` headers
- excessive cookie counts
- CSP violations
- WAF XSS matches
- state-changing requests with unexpected origins
- user-content hosts attempting to set cookies

Cloudflare Logpush should forward these events to the central logging system
when available.

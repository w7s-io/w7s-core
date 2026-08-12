# Initial Risk Register

| ID | Risk | Impact | Likelihood | Treatment | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | W7S claims ISO compliance before certification evidence exists. | High | Medium | Mitigate by using only "ISO readiness planning" language until audit completion. | TBD | Open |
| R-002 | W7S KV usage rollups are mistaken for billing-grade accounting. | High | Medium | Mitigate by using `account.w7s.io` ledger and idempotent billing events as source of truth. | TBD | Open |
| R-003 | Production access is not reviewed regularly. | High | Medium | Mitigate with quarterly GitHub, Cloudflare, and Stripe access reviews. | TBD | Open |
| R-004 | Stripe webhook spoofing leads to fraudulent credit grants. | High | Low | Mitigate with Stripe signature verification and event id deduplication. | TBD | In progress |
| R-005 | Customer deletion process is undefined. | Medium | Medium | Mitigate with documented export and deletion procedure for platform-held data. | TBD | Open |
| R-006 | Incident response depends on informal knowledge. | High | Medium | Mitigate with incident runbook and tabletop exercise. | TBD | Open |
| R-007 | Vendor compliance evidence is missing during audit. | Medium | Medium | Mitigate by collecting Cloudflare, GitHub, and Stripe compliance evidence annually. | TBD | Open |
| R-008 | Secrets are spread across repos or local machines. | High | Medium | Mitigate with inventory, GitHub/Cloudflare secret review, and no committed secrets policy. | TBD | Open |
| R-009 | Logs retain customer or end-user data longer than necessary. | Medium | Medium | Mitigate with documented retention schedule and deletion process. | TBD | Open |
| R-010 | Telegram operational notifications expose sensitive details. | Medium | Medium | Mitigate with event content review and limits on secrets/customer data in notifications. | TBD | Open |

# Control Roadmap

## Governance

- Define compliance owner.
- Define security owner.
- Define privacy owner.
- Approve scope.
- Approve risk methodology.
- Schedule quarterly management review.

## Asset Management

- Maintain repository inventory.
- Maintain Cloudflare resource inventory.
- Maintain GitHub Actions secrets inventory.
- Maintain service ownership inventory.
- Classify data handled by each production service.

## Access Control

- Require MFA for GitHub, Cloudflare, and Stripe.
- Use least privilege for production access.
- Review access quarterly.
- Document break-glass access.
- Remove stale users immediately.

## Secure Development

- Require pull request review for production repos.
- Run typecheck and tests in CI.
- Keep deploy metadata visible on `/health`.
- Track dependency updates.
- Track security fixes.
- Keep architecture decisions in `docs/agent/DECISIONS.md`.

## Operations

- Document deploy, rollback, and live verification.
- Document incident response.
- Document backup and restore expectations.
- Document log retention and access.

## Supplier Management

- Maintain subprocessors list.
- Collect Cloudflare, GitHub, and Stripe compliance evidence annually.
- Review vendor access and data processing terms annually.

## Privacy

- Maintain PII inventory.
- Maintain retention schedule.
- Maintain deletion and export procedure.
- Maintain breach notification procedure.
- Run privacy impact assessment for new high-risk features.

## Billing Integrity

- Treat `account.w7s.io` D1 ledger as billing source of truth.
- Keep W7S core usage rollups as operational protection only.
- Use idempotency keys for reservations and usage events.
- Keep Stripe webhook event IDs deduplicated.
- Verify Stripe webhook signatures before processing.

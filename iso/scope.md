# ISO Scope

## In Scope

Production services:

- `w7s.cloud`: hosted W7S deploy and runtime control plane.
- `account.w7s.io`: account, billing, wallet, Stripe, reservation, and usage-event authority.
- `w7s.io`: public documentation and product surface where security, privacy, and pricing promises are published.

Production repositories:

- `w7s-io/w7s-core`
- `w7s-io/account-w7s-io`
- `w7s-io/docs`
- `w7s-io/w7s-manager`

Core providers:

- Cloudflare
- GitHub
- Stripe
- Telegram, for operational notifications and manager context

## Data Categories

Customer and account data:

- GitHub owner login and repo metadata.
- Deployment metadata.
- Custom domain metadata.
- Usage metrics.
- Logs and platform events.
- Billing wallet and Stripe customer references.
- Telegram chat ids used for operational notification routing.

Potential customer content:

- Static assets uploaded to W7S.
- Worker scripts uploaded to W7S.
- Runtime logs produced by customer apps.
- Binding metadata.

## Responsibility Boundaries

W7S is responsible for:

- Platform access control.
- Production deploy controls.
- Isolation and routing controls.
- Storage configuration and retention.
- Billing ledger correctness.
- Operational notifications.
- Incident response for hosted W7S.
- Customer deletion and export procedures for platform-held data.

Customers are responsible for:

- Their application code.
- Their application secrets.
- The data their application collects or processes.
- Legal basis and notices for their own end users.

Cloudflare is responsible for:

- Infrastructure controls under its service commitments.
- Cloudflare platform certifications and audit reports.

GitHub is responsible for:

- GitHub platform controls under its service commitments.
- Repository hosting and GitHub Actions infrastructure controls.

Stripe is responsible for:

- Payment processing controls under its service commitments.
- PCI scope for card handling when W7S uses Stripe-hosted Checkout.

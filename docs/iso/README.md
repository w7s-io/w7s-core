# W7S ISO Compliance Program

This folder is the execution workspace for making hosted W7S ready for ISO 27001, ISO 27018, and ISO 27701.

## Objective

Prepare `w7s.cloud` and its supporting services for an external certification path by building a real Information Security Management System, privacy management controls, and audit evidence.

## Standards

- ISO 27001: Information Security Management System.
- ISO 27018: Protection of personally identifiable information in public cloud services acting as a PII processor.
- ISO 27701: Privacy Information Management System controls for PII controllers and processors.

## Working Scope

Initial scope is intentionally tight:

- Hosted W7S control plane at `w7s.cloud`.
- Account and billing service at `account.w7s.io`.
- Public docs and landing surfaces at `w7s.io`.
- GitHub Actions based deploy path.
- Cloudflare Workers, D1, KV, R2, Dispatch Namespace, Workers AI, Queues, Workflows, Analytics Engine, and Email Service bindings used by hosted W7S.
- GitHub organization repositories and production secrets used to operate hosted W7S.
- Telegram manager notifications and operational context used by the W7S agent fleet.

Out of initial scope:

- Customer application code deployed on W7S, except for platform responsibilities around isolation, routing, logs, metadata, and deletion.
- Self-hosted W7S Metal installations operated by customers.
- Experimental local-only repos that are not part of hosted production.

## Folder Map

- [execution-plan.md](execution-plan.md): Step-by-step execution plan.
- [scope.md](scope.md): System, data, vendor, and responsibility boundaries.
- [asset-and-data-inventory.md](asset-and-data-inventory.md): First scoped inventory of production services, repositories, cloud assets, data categories, vendors, and open questions.
- [evidence-register.md](evidence-register.md): Evidence checklist for audit readiness.
- [control-roadmap.md](control-roadmap.md): Control families and implementation work.
- [risk-register.md](risk-register.md): Initial compliance and security risk register.
- [policies-needed.md](policies-needed.md): Policies and procedures to draft.

## Current Status

Status: planning.

The program is not certification-ready yet. We can truthfully say W7S is planning ISO readiness, not that W7S is certified or compliant.

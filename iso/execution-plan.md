# ISO Execution Plan

## Phase 0: Program Setup

Goal: create a usable compliance operating model.

1. Name the compliance owner.
2. Name the technical control owner for each production repo.
3. Confirm certification scope for `w7s.cloud`, `account.w7s.io`, and `w7s.io`.
4. Create an evidence storage location with restricted access.
5. Decide target auditor or readiness consultant.
6. Define the first audit window.

Exit criteria:

- Scope approved.
- Owners assigned.
- Evidence storage ready.
- Audit target date chosen.

## Phase 1: Asset and Data Inventory

Goal: know what exists, what data it handles, and who owns it.

1. Inventory production services.
2. Inventory repositories and deployment workflows.
3. Inventory Cloudflare resources.
4. Inventory GitHub organizations, teams, repo permissions, and secrets.
5. Inventory customer data categories.
6. Map data flows for deploys, runtime requests, logs, billing, notifications, and support.
7. Identify subprocessors.

Exit criteria:

- Asset inventory exists.
- Data inventory exists.
- Data flow diagrams exist.
- Subprocessor list exists.

## Phase 2: Risk Assessment

Goal: create the first ISO 27001 risk register and treatment plan.

1. Identify threats against the scoped systems.
2. Score likelihood and impact.
3. Pick treatment: mitigate, transfer, accept, or avoid.
4. Assign owners and due dates.
5. Define residual risk acceptance rules.

Exit criteria:

- Risk register has owners and treatment actions.
- High risks have mitigation plans.
- Accepted risks are explicitly approved.

## Phase 3: Core Security Controls

Goal: implement the security baseline needed before audit evidence collection.

1. Enforce MFA for GitHub and Cloudflare.
2. Review production access and remove stale access.
3. Define break-glass access.
4. Document secret management.
5. Document production deploy approval flow.
6. Ensure `/health` metadata exists on backend services.
7. Centralize incident response procedure.
8. Define log retention and access rules.
9. Define backup and restore expectations.
10. Document vulnerability management and dependency update cadence.

Exit criteria:

- Access reviews complete.
- Secret and deploy procedures documented.
- Incident runbook approved.
- Logging, retention, and backup rules documented.

## Phase 4: Privacy Controls

Goal: prepare for ISO 27018 and ISO 27701.

1. Classify PII handled by W7S.
2. Separate controller and processor responsibilities.
3. Document customer deletion and export process.
4. Document data retention schedules.
5. Document subprocessors and transfer basis.
6. Document breach notification process.
7. Define privacy impact assessment process for new features.

Exit criteria:

- PII inventory complete.
- Privacy responsibility matrix complete.
- Retention and deletion rules approved.
- Breach notification workflow documented.

## Phase 5: Evidence Collection

Goal: collect audit-ready proof that controls operate, not just policies.

1. Run the first access review.
2. Capture deploy workflow evidence.
3. Capture health metadata evidence.
4. Capture backup or restore test evidence.
5. Capture incident response tabletop evidence.
6. Capture vendor review evidence.
7. Capture risk review evidence.
8. Capture security training acknowledgement evidence.

Exit criteria:

- Evidence register has owners, dates, and links.
- Every critical control has at least one evidence artifact.

## Phase 6: Readiness Review

Goal: find gaps before an external audit.

1. Review scope against implemented controls.
2. Review policies against actual practice.
3. Test evidence completeness.
4. Review open risks.
5. Fix gaps.
6. Run a mock audit.

Exit criteria:

- Readiness gaps are closed or accepted.
- External audit scope is final.

## Phase 7: Certification Audit

Goal: complete certification with minimal surprise.

1. Provide scope statement.
2. Provide policy set.
3. Provide risk register and treatment plan.
4. Provide control implementation evidence.
5. Answer auditor requests.
6. Track nonconformities.
7. Close corrective actions.

Exit criteria:

- Certification achieved, or corrective action plan created with deadlines.

## Suggested Timeline

Week 1: Phase 0 and Phase 1.

Week 2: Phase 2.

Weeks 3 to 5: Phase 3 and Phase 4.

Weeks 6 to 8: Phase 5.

Weeks 9 to 10: Phase 6.

After readiness: schedule certification audit.

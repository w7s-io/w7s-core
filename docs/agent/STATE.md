# W7S Core Agent State

## Current Runtime State

- W7S core routes deployed apps from default domains, repo-prefix paths, and custom domains.
- Runtime usage is accounted through `runtime.request` and app suspension is enforced by W7S cost guards.
- Short-window `runtime.request` limits can suspend apps when real application traffic exceeds policy.
- Scanner traffic against mapped custom domains can generate W7S-owned `not_found` 404 responses before the app runtime does useful work.

## Active Priorities

- Keep custom-domain scanner noise from suspending customer apps when W7S returns cheap `not_found` 404 responses.
- Continue recording `runtime.request` telemetry for all routed requests, including scanner 404s.
- Preserve suspension behavior for actual app/workload traffic and non-rate policy enforcement.
- Keep platform health responses compatible with backend metadata expectations by exposing `branch`, `commitHash`, and `deployedAt`; `commitId` remains present for backward compatibility.

## Known Incident Context

- `omattic/seokeywordexplorer-com` received a production suspension notification on 2026-07-11 because `runtime.request` hit the repo short-window policy at `300/300`.
- Live Analytics Engine data showed the burst was custom-domain scanner traffic on `www.seokeywordexplorer.com`, mostly `curl/8.7.1`, probing secret/admin paths and receiving `not_found:custom-domain` 404s.
- The deployed SEO Keyword Explorer commit already returned plain 404s for scanner paths; the remaining issue was W7S suspension enforcement counting cheap W7S-generated 404 bursts as suspendable app traffic.

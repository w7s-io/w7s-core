# W7S Core Linked Repositories

## omattic/inbox

- Uses one tenant branch per workspace, starting with `inglesconliza`.
- Each `apps/*` deployment owns a leaf `w7s.json` name and a path route on the tenant hostname.
- Tenant apps disable the generated W7S domain and use direct branch custom domains under `*.omattic.com`.
- Deployment workflows use GitHub `paths` filters and the W7S action `working-directory` input.

## w7s-io/w7s-cloud

- The reusable action reads the leaf manifest name, sends `x-w7s-application`, and preserves that identity in usage and logs checks.

## omattic/seokeywordexplorer-com

- Local checkout: `/home/gnu/seokeywordexplorer-com`
- Production custom domains: `seokeywordexplorer.com`, `www.seokeywordexplorer.com`
- W7S deployment key: `deployment:v1:production:omattic:seokeywordexplorer-com`
- Incident context: 2026-07-11 short-window `runtime.request` suspension was caused by scanner traffic hitting unknown custom-domain paths and receiving W7S `not_found:custom-domain` 404s.

## Cross-Repo Contract

- App repos should return explicit 404s for obvious scanner paths instead of serving SPA shells.
- W7S core still owns routing telemetry, usage accounting, and suspension enforcement for custom-domain traffic before or after app dispatch.
- App repos can request path-based custom routes by putting entries such as `omattic.com/compress-video` in `CNAME`; W7S strips `/compress-video` before static or backend dispatch.
- Hosted W7S ISO readiness planning is canonical in `w7s-core/docs/iso/`.

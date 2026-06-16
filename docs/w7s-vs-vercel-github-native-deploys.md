# W7S vs Vercel: GitHub-Native Deploys Without a Dashboard

Modern deployment platforms are powerful, but many of them feel heavier than the apps they host.

You start with a simple JavaScript or TypeScript project. Then you create a platform account, connect a Git provider, import a project, click through build settings, configure variables, review permissions, check billing, and learn where the platform keeps its source of truth. The code still lives in GitHub, but the deploy system now lives somewhere else.

That split is tolerable for large teams. For indie hackers, solo founders, and full-stack developers shipping small products, it often feels like ceremony. The app is in one place. The deploy history is in another. Configuration is partly in a dashboard.

W7S takes a different position: the repository should be the control plane.

## How W7S Works

W7S is built around GitHub Actions. To deploy an app, you add one workflow file to your repository and push code. There is no W7S dashboard. There is no separate W7S account to create. There is no cloud console to configure before the first deploy. There is no credit card gate just to put an app online.

The minimal workflow is intentionally small:

```yaml
name: Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5

      - uses: w7s-io/w7s-cloud@v1
```

That is the core idea. GitHub already knows who owns the repository. GitHub already records every workflow run. GitHub already has branch protection, commit history, pull requests, deploy logs, and permission management. W7S uses that instead of asking you to recreate the same structure in another product.

Authentication happens through GitHub Actions OIDC. The deploy action requests an identity token from GitHub, and W7S verifies that token against the repository being deployed. That means deploy permission follows GitHub repository permission. If a person or bot cannot run the workflow in GitHub, they cannot deploy through W7S.

There is no hidden project object that you have to remember to update in a separate dashboard. There is no second permissions model to keep in sync.

## More Than Static Hosting

A dashboard-free deploy system would not be very interesting if it only hosted static files. W7S supports static frontends, but it is designed for full-stack apps.

A repository can publish frontend assets and a native backend Worker. The backend can use real platform primitives instead of pretending every app is just a handful of request handlers.

W7S supports:

- Static frontend assets.
- Native JavaScript and TypeScript backend Workers.
- Durable Objects for stateful coordination.
- D1 serverless database bindings.
- Queues.
- Cron schedules.
- Workflows.
- AI bindings.
- Hyperdrive/Postgres bindings.
- R2 and KV bindings.
- Custom domains.

Those resources are declared in the repository, then provisioned and attached during deploy. A solo developer can keep code, backend entrypoint, deploy workflow, and infrastructure declaration together.

That is the important distinction. W7S is not trying to be a visual cloud console. It is trying to make a GitHub repository enough to ship a real app.

## W7S vs Vercel

Vercel is a mature, polished platform. It has excellent support for frontend frameworks, especially Next.js. It provides Git integrations, preview deployments, serverless functions, domains, analytics, and a large frontend ecosystem.

The tradeoff is that Vercel is still dashboard-first. A project exists inside Vercel. Settings live in Vercel. Billing lives in Vercel. Team access lives in Vercel. Even when deploys are triggered from Git, the platform relationship is centered around the Vercel project.

W7S makes a different tradeoff. It removes the dashboard and puts the repository in charge.

| Area | W7S | Vercel |
| --- | --- | --- |
| Setup | Add one GitHub Action and push. No W7S account is required for the hosted path. | Create or use a Vercel account, import/link a project, and configure it in Vercel. Git integration can automate future deploys. |
| Dashboard requirement | No dashboard. GitHub Actions is the deploy interface. | Dashboard is central for projects, settings, domains, usage, billing, teams, and observability. |
| Source of truth | GitHub repository: workflow, permissions, commit history, and optional `w7s.json`. | Split between Git repository and Vercel project configuration. Some settings can be codified, but the platform project remains central. |
| Backend support | Native JavaScript/TypeScript backend Workers alongside static frontends. | Vercel Functions and framework routes work well for many server-side tasks, especially within supported framework conventions. |
| Stateful features | Durable Objects, serverless database, queues, schedules, workflows, AI, Postgres/Hyperdrive, KV, and R2-style storage bindings. | Strong frontend and function platform, with backend capability oriented around serverless functions, managed integrations, and framework patterns. |
| Lock-in | Hosted W7S is optional. The core is open source and self-hostable on your own Cloudflare account. | Apps are organized around Vercel projects, Vercel build/runtime behavior, and Vercel account/team/billing configuration. |
| Pricing model | Hosted version is usage-based. You pay when the app has real usage, not a subscription just to keep it online. | Free Hobby exists for eligible use cases. Pro is seat/subscription based with included usage and additional usage billing. |
| Self-hosting | Fully open source and self-hostable. | Vercel provides a managed platform. The open source framework ecosystem is broad, but the Vercel platform itself is not something you self-host as your own equivalent. |

The short version: Vercel optimizes for an integrated product experience. W7S optimizes for repository ownership.

If you deploy through a dashboard-first platform, you eventually learn the platform's model: projects, teams, environment groups, build settings, billing settings, domains, integrations, usage dashboards, and platform-specific defaults. Some of that is useful. Some of it is necessary at scale. But it is still another control plane.

W7S asks whether small teams need that second control plane at all. For many apps, the answer is no. GitHub is already where the project lives. GitHub Actions is already where CI runs. GitHub permissions are already where deploy authority should be decided.

## The Lock-In Question

Lock-in is not always bad. A platform can be worth adopting because its conventions save time. Vercel's conventions are a good example. If you build a Next.js app and want the platform that understands that model deeply, Vercel is attractive.

The problem is when the conventions become invisible dependencies. With dashboard-first platforms, the app is not fully described by the repository. To understand production, you may need external project settings. To move the app, you may need to recreate variables, domains, build behavior, redirects, function settings, integrations, and team access somewhere else.

W7S keeps the center of gravity in GitHub. The deploy workflow is a file. The infrastructure manifest is a file. The backend code is regular JavaScript or TypeScript. The core is open source and can run on your own Cloudflare account.

That does not mean there is zero platform coupling. W7S is built on Cloudflare primitives, so an app that uses Durable Objects, D1, Queues, or Workers-style bindings is intentionally using that platform model. The difference is that the platform layer is explicit, repository-declared, and self-hostable.

## Pricing: Paying for Usage, Not Existence

Pricing matters differently for indie projects than it does for companies. A solo founder may have experiments, side projects, prototypes, internal tools, and small products that sit quiet for weeks. Paying subscriptions just to keep them online changes what you are willing to ship.

W7S hosted pricing is usage-based. An app that gets real traffic should pay for the resources it uses. An app that is merely online should not require a subscription just to exist.

That model is useful for small bets. You can deploy first and find out whether the project matters. If it grows, usage grows and cost follows. If it does not, it can remain online without becoming another recurring line item.

Vercel also has a free Hobby tier and usage-based infrastructure billing, and that is useful. But the professional path is tied to paid plans, seats, included usage, and additional usage billing. That can be reasonable for funded products and teams. It is less appealing when you are shipping many small apps and want the lowest possible operational commitment.

## When to Choose W7S

Choose W7S when you want GitHub to be the deploy interface.

It is a good fit if you:

- Want to deploy by committing a workflow file.
- Do not want another dashboard.
- Want repository permissions to define deploy permissions.
- Prefer infrastructure declarations in the repo.
- Need a static frontend plus a real JavaScript or TypeScript backend.
- Want stateful primitives such as Durable Objects.
- Want queues, schedules, workflows, database bindings, AI bindings, or Postgres bindings without leaving the repository model.
- Want an open source platform you can self-host on your own Cloudflare account.
- Prefer usage-based hosted pricing over subscriptions for idle apps.

W7S is also a good fit for developers who think the deployment platform should be boring. Push code. Let GitHub Actions run. Get a URL.

## When Vercel Still Makes Sense

Vercel may still be the better choice when you want the full Vercel product experience.

It makes sense if:

- You are building heavily around Next.js and want first-class framework integration.
- Your team already uses Vercel projects, previews, analytics, and domain management.
- You want polished dashboard workflows for non-engineering teammates.
- You prefer a managed product over a self-hostable open source control plane.
- Your backend needs are mostly framework routes and serverless functions.
- You value Vercel's ecosystem and conventions more than repository-only control.

That is not a knock on Vercel. A dashboard can be useful. A framework-heavy platform can be productive. The question is whether you need it for every app. If your app is a small product, a tool, a prototype, or a solo founder project, the dashboard may be more process than value.

## Conclusion

W7S and Vercel both deploy web apps, but they start from different assumptions.

Vercel assumes the deployment platform should be a full product with projects, dashboards, settings, billing, previews, integrations, and framework-aware workflows. That can be excellent when you want a managed frontend platform and are comfortable making Vercel part of your operating model.

W7S assumes your repository is already the operating model.

Add one GitHub Action. Push code. Let GitHub prove who you are through OIDC. Keep deploy history, permissions, and configuration close to the code. Use native backend primitives when the app needs them. Pay for real usage on the hosted service, or self-host the open source core on your own Cloudflare account.

The opinion is simple: for many indie hackers, full-stack developers, and solo founders, the best dashboard is no dashboard. If the repo is the source of truth, deployment should start and end there.

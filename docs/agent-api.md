# Agent API

W7S exposes a read-only agent-facing API for tools that need to inspect repository infrastructure without scraping HTML or guessing from deploy records.

## Discovery

Public discovery documents:

```text
GET https://w7s.cloud/agent.json
GET https://w7s.cloud/.well-known/agent.json
GET https://w7s.cloud/api/v1/agent/openapi.json
GET https://w7s.cloud/api/v1/agent/manifest-schema
```

`agent.json` describes the W7S service, GitHub OIDC authentication, the read-only action set, docs links, and endpoint templates.

## Authentication

Repository-scoped agent endpoints use the same repository access check as deploy, usage, analytics, and logs:

```text
Authorization: Bearer <github-actions-oidc-token>
```

The token must be authorized for the requested `<owner>/<repo>`. Legacy GitHub API bearer tokens remain accepted by the shared auth verifier.

## Repository State

Read consolidated state:

```text
GET https://w7s.cloud/api/v1/agent/repos/<owner>/<repo>?environment=production
```

The response includes:

- current deployment metadata;
- public URLs and custom domains;
- static and Worker targets;
- bindings, queues, schedules, workflows, RPC, and AI declarations;
- managed resource records;
- usage, limits, analytics, and logs links;
- read-only capabilities;
- suggested next actions for agents.

Drill-down endpoints:

```text
GET /api/v1/agent/repos/<owner>/<repo>/deployments
GET /api/v1/agent/repos/<owner>/<repo>/resources?environment=production
GET /api/v1/agent/repos/<owner>/<repo>/routes?environment=production
```

## Safety

The v1 Agent API is read-only. It does not create, update, delete, roll back, or mutate infrastructure directly.

Agents should manage W7S infrastructure by editing `w7s.json` in the repository and triggering a normal GitHub Actions deploy. Agent API responses intentionally omit binding bearer token hashes, secret values, Cloudflare API tokens, and W7S operator credentials.

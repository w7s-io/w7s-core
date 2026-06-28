# Replace n8n Cron Workflows With W7S Scheduled JavaScript

The easiest n8n workflows to replace with W7S are cron workflows.

They usually start with a schedule trigger, fetch data from one or more APIs, run some transformation logic, and push results somewhere else. The workflow may look impressive on a canvas, but the core logic is often a small JavaScript program.

W7S lets you keep that program as code.

You declare a schedule in `w7s.json`, implement the route in a native JavaScript or TypeScript backend, and deploy from GitHub. W7S runs a platform cron every minute, checks deployed app schedules, and dispatches due jobs to your backend route.

No workflow editor is required.

## What Counts as a Good Fit

Cron workflows are good W7S candidates when they are deterministic and developer-owned.

Good examples:

- sync records from one API to another every 15 minutes;
- check a product page for price or inventory changes;
- create a daily digest;
- refresh a content index;
- call an AI model to classify new rows;
- clean stale database records;
- send scheduled customer reminders;
- fetch analytics and post a report;
- monitor an RSS feed;
- update a static JSON file in object storage.

Poor examples:

- workflows that non-developers must edit every week;
- ad hoc operations that require visual debugging;
- business processes where a user needs to inspect every step in a UI;
- automations that rely heavily on prebuilt no-code connectors your team does not want to maintain.

W7S is best when the automation is closer to backend code than business process modeling.

## The W7S Schedule Model

A W7S schedule is declared in the repository:

```json
{
  "schedules": [
    {
      "cron": "0 8 * * *",
      "path": "/_w7s/schedules/daily-report"
    },
    {
      "cron": "*/15 * * * *",
      "path": "/_w7s/schedules/sync-products"
    }
  ]
}
```

Each schedule has a five-field UTC cron expression and a backend path. When the schedule is due, W7S sends a request to that path with schedule metadata.

Your backend handles it like any other route:

```ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/_w7s/schedules/sync-products") {
      return syncProducts(env);
    }

    if (url.pathname === "/_w7s/schedules/daily-report") {
      return sendDailyReport(env);
    }

    return new Response("Not found.", { status: 404 });
  }
};
```

That is the whole control flow. There is no hidden workflow state machine unless you choose to build one.

## Example: Product Monitor

An n8n version of a product monitor might use:

- Cron node.
- HTTP Request node.
- HTML Extract node.
- IF node.
- Telegram node.
- Data store node.

In W7S, the same idea can be a script:

```ts
type ProductState = {
  price: number;
  available: boolean;
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname !== "/_w7s/schedules/check-product") {
      return new Response("Not found.", { status: 404 });
    }

    const current = await fetchProductState("https://shop.example.com/product/widget");
    const previous = await env.PRODUCTS_KV.get<ProductState>("widget", "json");

    if (!previous || previous.price !== current.price || previous.available !== current.available) {
      await notifyTelegram(env, current, previous);
      await env.PRODUCTS_KV.put("widget", JSON.stringify(current));
    }

    return Response.json({ ok: true, current });
  }
};
```

The manifest declares the schedule and storage:

```json
{
  "kv": [
    {
      "binding": "PRODUCTS_KV",
      "name": "product-state"
    }
  ],
  "schedules": [
    {
      "cron": "*/10 * * * *",
      "path": "/_w7s/schedules/check-product"
    }
  ]
}
```

The GitHub workflow deploys it:

```yaml
name: Deploy

on:
  push:
    branches: [main]
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

That gives you a scheduled automation with code review, deployment history, logs, health metadata, and repository-owned configuration.

## Why This Can Cost Less

Cron jobs become expensive on execution-count platforms because the clock keeps running.

The n8n pricing page explains that cloud plans are based on monthly workflow executions. It also gives the practical example that a workflow running every five minutes results in roughly 8,600 to 8,900 monthly executions. Source: [n8n pricing FAQ](https://n8n.io/pricing/).

That does not make n8n bad. It makes frequent cron jobs a cost-sensitive workload.

With W7S, a cron job is a backend route. The hosted cost model is tied to actual platform usage, and the open source core can be self-hosted on your own Cloudflare account. For lightweight API polling, JSON transforms, and AI calls, the difference can be substantial.

The more your workflow looks like code, the stronger the W7S case becomes.

## What You Give Up

Replacing n8n with W7S is not free in every sense.

You give up:

- visual workflow editing;
- the n8n node catalog;
- built-in node-level execution UI;
- non-developer workflow ownership;
- drag-and-drop experimentation.

You gain:

- regular JavaScript or TypeScript;
- GitHub pull requests;
- tests;
- deploy logs;
- explicit infrastructure manifests;
- runtime health metadata;
- lower ceremony for developer-owned automation;
- an easier path to queues, storage, AI bindings, and custom backend logic.

The trade is simple: less visual tooling, more software discipline.

## Migration Checklist

For each n8n cron workflow, ask:

1. What is the trigger schedule?
2. What external APIs does it call?
3. What secrets does it need?
4. What state does it persist?
5. What should happen on failure?
6. Does a non-developer need to edit it?
7. Can it be tested as a JavaScript function?

If the answer to the last two questions is "developer-owned and testable," W7S is likely a strong fit.

Start by replacing one workflow. Keep the route small. Add logs. Add `/health`. Deploy from GitHub. Once the pattern is boring, move the next one.

That is how automation should feel: boring, inspectable, and cheap to keep running.

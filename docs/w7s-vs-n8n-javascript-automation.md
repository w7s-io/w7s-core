# W7S vs n8n: JavaScript Automation Without the Workflow Tax

n8n is a strong automation product. It gives teams a visual editor, a large integration catalog, hosted and self-hosted options, and a workflow model that non-specialists can understand. If your team wants to drag nodes onto a canvas, inspect saved executions, and let less technical operators adjust automations directly, n8n can be the right tool.

But not every automation needs a visual workflow editor.

Many production automations are just JavaScript:

- run every hour;
- call two or three APIs;
- transform JSON;
- ask an AI model to classify or summarize something;
- write a result to a database, queue, webhook, or email service;
- log what happened.

For that class of work, W7S can be a simpler and cheaper alternative. Instead of paying for a workflow platform to run a chain of boxes, you deploy a regular JavaScript or TypeScript backend from GitHub, declare cron schedules in `w7s.json`, and let W7S call your code on schedule.

The result is automation that behaves like software, not a dashboard artifact.

## The Pricing Difference Starts With the Unit of Work

n8n Cloud is priced around workflow executions. The official n8n pricing page says its cloud plans include unlimited workflows and integrations, but are priced by monthly workflow executions. As of June 28, 2026, the official annual prices shown by n8n are:

| n8n plan | Price shown by n8n | Included workflow executions |
| --- | ---: | ---: |
| Starter | 20 EUR/month, billed annually | 2.5K/month |
| Pro | 50 EUR/month, billed annually | 10K/month |
| Business | 667 EUR/month, billed annually | 40K/month |

Source: [n8n pricing](https://n8n.io/pricing/).

n8n's execution model is reasonable for visual automation. One full workflow run counts as one execution regardless of how many steps are inside it. That is more predictable than tools that bill by every individual step.

The problem appears when an automation is naturally frequent.

A job that runs every five minutes executes about 8,600 to 8,900 times per month. That is one simple scheduled job. Add a few more polling jobs, AI enrichment jobs, sync jobs, alert checks, and webhook processors, and execution-count pricing can become the main thing you optimize around.

W7S approaches the same work differently. You write the automation as code and deploy it like an app. Hosted W7S is usage-oriented at the platform/runtime level rather than a workflow-editor execution subscription. If the automation is mostly lightweight JavaScript running on a schedule, the cost profile can be dramatically lower.

## A Cron Job Is Often Enough

In n8n, a scheduled workflow might look like this:

1. Cron trigger.
2. HTTP request to fetch records.
3. Code node to normalize data.
4. AI node to classify records.
5. Filter node.
6. HTTP request to update another system.
7. Slack or email notification.

In W7S, the same job can be one route:

```ts
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/_w7s/schedules/enrich-leads") {
      return runLeadEnrichment(env);
    }

    return new Response("Not found.", { status: 404 });
  }
};

async function runLeadEnrichment(env: Env) {
  const leads = await fetch("https://crm.example.com/api/leads").then((res) => res.json());

  for (const lead of leads.pending) {
    const ai = await env.W7S_AI.fetch("https://w7s.internal/api/v1/ai/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.W7S_AI_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Classify this lead as hot, warm, or cold." },
          { role: "user", content: JSON.stringify(lead) }
        ]
      })
    }).then((res) => res.json());

    await fetch(`https://crm.example.com/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ score: ai.output })
    });
  }

  return Response.json({ ok: true, processed: leads.pending.length });
}
```

The schedule lives next to the code:

```json
{
  "schedules": [
    {
      "cron": "*/5 * * * *",
      "path": "/_w7s/schedules/enrich-leads"
    }
  ]
}
```

Commit it, push it, and GitHub Actions deploys it through W7S.

## Where W7S Is Better

W7S is better when the automation is owned by developers and should be versioned, reviewed, tested, and deployed like code.

That includes:

- scheduled data syncs;
- AI enrichment jobs;
- lead scoring;
- product monitoring;
- Slack or Telegram notifications;
- content pipelines;
- webhook processors;
- daily reports;
- invoice or billing checks;
- scraping and extraction jobs;
- database cleanup tasks;
- queue-backed background work.

The advantage is not just price. It is control.

In W7S, the automation is a normal repository. Pull requests show the actual diff. Tests can run before deploy. Secrets and bindings are declared explicitly. Rollbacks are Git-based. The runtime can expose `/health` with `branch`, `commitHash`, and `deployedAt`, so operators can see exactly what is live.

Visual workflow builders often make the first version fast. Code-first deployment makes the tenth version safer.

## Where n8n Still Wins

n8n is still better when the visual editor is the product requirement.

Choose n8n when:

- non-developers need to edit workflows;
- the integration catalog matters more than code control;
- operators need saved execution history in a dashboard;
- the automation is exploratory and changes daily;
- business users need to inspect every node in a run;
- you want a hosted visual automation system more than a code deployment platform.

W7S is not trying to replace that experience. It is for a different buyer: developers who see a workflow and think, "this should just be a script."

## The Bottom Line

n8n is a workflow automation platform. W7S is a GitHub-native app platform with cron schedules, JavaScript backends, queues, workflows, storage, and AI bindings.

If your automation needs a visual editor, n8n is strong.

If your automation is really a scheduled JavaScript job with API calls and AI, W7S can do the same work with less ceremony and a better cost profile.

The practical rule is simple:

Use n8n when the workflow belongs in a canvas.

Use W7S when the workflow belongs in Git.

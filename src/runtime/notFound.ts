const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const requestDetails = (request: Request) => {
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  return {
    host,
    path: `${url.pathname}${url.search}`
  };
};

const shouldRenderHtml = (request: Request) =>
  request.headers.get("sec-fetch-mode") === "navigate";

const headers = (contentType: string) => ({
  "cache-control": "no-store",
  "content-type": contentType,
  "x-robots-tag": "noindex, nofollow, noarchive"
});

const html = (request: Request) => {
  const details = requestDetails(request);
  const route = `${details.host}${details.path}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>Deployment not connected | W7S</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #f8fafc;
        --panel: #ffffff;
        --text: #111827;
        --muted: #5b6472;
        --line: #d9e0ea;
        --accent: #0f766e;
        --accent-soft: #dff5f1;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        background:
          linear-gradient(180deg, rgba(15, 118, 110, 0.08), rgba(248, 250, 252, 0) 45%),
          var(--bg);
        color: var(--text);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
          sans-serif;
      }
      main {
        width: min(100%, 720px);
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: clamp(28px, 6vw, 56px);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 36px;
        font-weight: 800;
        letter-spacing: 0;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        font-size: 18px;
      }
      .status {
        display: inline-flex;
        margin-bottom: 18px;
        border: 1px solid rgba(15, 118, 110, 0.2);
        border-radius: 999px;
        padding: 6px 10px;
        background: var(--accent-soft);
        color: #0b5f59;
        font-size: 13px;
        font-weight: 700;
      }
      h1 {
        margin: 0;
        max-width: 12ch;
        font-size: clamp(40px, 8vw, 72px);
        line-height: 0.95;
        letter-spacing: 0;
      }
      p {
        margin: 20px 0 0;
        max-width: 58ch;
        color: var(--muted);
        font-size: 18px;
        line-height: 1.6;
      }
      code {
        display: block;
        margin-top: 28px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px 16px;
        overflow-wrap: anywhere;
        background: #f1f5f9;
        color: #0f172a;
        font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #080b12;
          --panel: #101720;
          --text: #f8fafc;
          --muted: #a7b0bf;
          --line: #253244;
          --accent-soft: rgba(20, 184, 166, 0.12);
        }
        main {
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
        }
        .status {
          color: #8ee9dd;
        }
        code {
          background: #0b111b;
          color: #dbeafe;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <div class="mark" aria-hidden="true">W7</div>
        <div>W7S Cloud</div>
      </div>
      <div class="status">404 deployment_not_connected</div>
      <h1>Deployment not connected</h1>
      <p>This W7S route is reachable, but there is no deployment attached to it yet. Deploy the app or connect this route to an existing W7S deployment.</p>
      <code>${escapeHtml(route)}</code>
    </main>
  </body>
</html>`;
};

export const platformDeploymentNotFoundResponse = (request: Request) => {
  const details = requestDetails(request);
  const payload = {
    status: "error",
    code: "deployment_not_connected",
    error: "Deployment not connected.",
    message:
      "This W7S route is reachable, but there is no deployment attached to it yet.",
    host: details.host,
    path: details.path
  };

  if (!shouldRenderHtml(request)) {
    return new Response(request.method === "HEAD" ? null : JSON.stringify(payload), {
      status: 404,
      headers: headers("application/json")
    });
  }

  return new Response(request.method === "HEAD" ? null : html(request), {
    status: 404,
    headers: headers("text/html; charset=utf-8")
  });
};

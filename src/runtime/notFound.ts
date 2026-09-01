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

const errorCode = "deployment_not_connected";
const errorMessage =
  "This W7S route is reachable, but there is no deployment attached to it yet.";

const html = () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>Deployment not connected | W7S</title>
    <style>
      :root {
        color-scheme: light dark;
        --text: #111827;
        --muted: #5b6472;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #fff;
        color: var(--text);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
          sans-serif;
      }
      main {
        width: min(100%, 560px);
      }
      code {
        display: block;
        margin: 0;
        font: 600 14px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      p {
        margin: 12px 0 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.6;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --text: #f8fafc;
          --muted: #a7b0bf;
        }
        body { background: #080b12; }
      }
    </style>
  </head>
  <body>
    <main>
      <code>404 ${errorCode}</code>
      <p>${errorMessage}</p>
    </main>
  </body>
</html>`;

export const platformDeploymentNotFoundResponse = (request: Request) => {
  const details = requestDetails(request);
  const payload = {
    status: "error",
    code: errorCode,
    error: "Deployment not connected.",
    message: errorMessage,
    host: details.host,
    path: details.path
  };

  if (!shouldRenderHtml(request)) {
    return new Response(request.method === "HEAD" ? null : JSON.stringify(payload), {
      status: 404,
      headers: headers("application/json")
    });
  }

  return new Response(request.method === "HEAD" ? null : html(), {
    status: 404,
    headers: headers("text/html; charset=utf-8")
  });
};

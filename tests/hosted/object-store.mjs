import { DurableObject } from "cloudflare:workers";

export class SmokeStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  read() {
    return this.ctx.storage.sql.exec("SELECT value FROM entries WHERE key = 'probe'").toArray()[0]?.value ?? null;
  }
  write(value) {
    this.ctx.storage.sql.exec("INSERT INTO entries VALUES ('probe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", value);
  }
  clear() { this.ctx.storage.sql.exec("DELETE FROM entries"); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hosts = JSON.parse(env.SMOKE_HOSTS);
    const id = hosts[url.hostname];
    if (!Object.hasOwn(hosts, url.hostname) || !id) return new Response("Unknown host", { status: 404 });
    if (url.pathname === "/health") return Response.json({
      branch: env.W7S_BRANCH, commitHash: env.W7S_COMMIT_HASH, deployedAt: env.W7S_DEPLOYED_AT,
      environment: env.W7S_ENVIRONMENT, revision: env.SMOKE_REVISION, service: env.SMOKE_SERVICE
    });
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (Date.now() >= Number(env.SMOKE_EXPIRES) || !/^[a-f0-9]{64}$/.test(supplied) ||
        !crypto.subtle.timingSafeEqual(new TextEncoder().encode(supplied), new TextEncoder().encode(env.SMOKE_TOKEN))) {
      return new Response("Unauthorized", { status: 401 });
    }
    const object = env.OBJECTS.getByName(id);
    if (url.pathname === "/api/clear" && request.method === "POST") {
      await object.clear();
      return new Response(null, { status: 204 });
    }
    if (url.pathname !== "/api/value") return new Response("Not found", { status: 404 });
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      if (!reader) return new Response("Body required", { status: 400 });
      const chunks = []; let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 256) { await reader.cancel(); return new Response("Too large", { status: 413 }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      await object.write(new TextDecoder().decode(bytes));
    } else if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    return Response.json({ value: await object.read(), revision: env.SMOKE_REVISION, object: id, service: env.SMOKE_SERVICE });
  }
};

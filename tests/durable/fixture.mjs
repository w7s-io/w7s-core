import { DurableObject } from "cloudflare:workers";

// Generic test application, never deployed by W7S itself.
export class ObjectStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS entries (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  put(key, value) {
    this.ctx.storage.sql.exec("INSERT INTO entries VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }
  get(key) {
    return this.ctx.storage.sql.exec("SELECT value FROM entries WHERE key = ?", key).toArray()[0]?.value ?? null;
  }
}
export class PreviewObjectStore extends ObjectStore {}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const binding = url.searchParams.get("preview") === "1" ? env.PREVIEW_OBJECTS : env.OBJECTS;
    const object = binding.getByName(url.searchParams.get("id") ?? "default");
    if (request.method === "POST") await object.put("value", await request.text());
    return Response.json(await object.get("value"));
  }
};

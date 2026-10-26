import { env, SELF, runInDurableObject, evictDurableObject } from "cloudflare:test";
import { expect, it } from "vitest";

it("creates named SQLite stores dynamically and isolates their rows", async () => {
  const a = env.OBJECTS.getByName("a");
  const b = env.OBJECTS.getByName("b");
  await a.put("same-key", "private-a");
  await b.put("same-key", "private-b");
  expect(await a.get("same-key")).toBe("private-a");
  expect(await b.get("same-key")).toBe("private-b");
  await runInDurableObject(a, (_instance, state) => {
    expect(state.storage.sql.exec("SELECT COUNT(*) AS n FROM entries").one().n).toBe(1);
  });
});

it("keeps identical names isolated across namespaces", async () => {
  await env.OBJECTS.getByName("shared-name").put("key", "production");
  expect(await env.PREVIEW_OBJECTS.getByName("shared-name").get("key")).toBeNull();
  await env.PREVIEW_OBJECTS.getByName("shared-name").put("key", "preview");
  expect(await env.OBJECTS.getByName("shared-name").get("key")).toBe("production");
});

it("routes application requests to on-demand objects", async () => {
  const write = await SELF.fetch("https://example.test/?id=dynamic", { method: "POST", body: "saved" });
  expect(await write.json()).toBe("saved");
  expect(await (await SELF.fetch("https://example.test/?id=dynamic")).json()).toBe("saved");
  expect(await (await SELF.fetch("https://example.test/?id=another")).json()).toBeNull();
});

it("retains SQLite data after object eviction", async () => {
  const object = env.OBJECTS.getByName("eviction");
  await object.put("key", "durable");
  await evictDurableObject(object);
  expect(await env.OBJECTS.getByName("eviction").get("key")).toBe("durable");
});

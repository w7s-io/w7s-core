import { env, SELF } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "./object-store.mjs";
const auth = { authorization: `Bearer ${"a".repeat(64)}` };

it("reports release metadata and rejects unknown hosts", async () => {
  const health = await SELF.fetch("https://smoke-a.example.com/health");
  expect(await health.json()).toMatchObject({ branch: "test", commitHash: "b".repeat(40), deployedAt: "2026-10-26T00:00:00Z" });
  expect((await SELF.fetch("https://unknown.example.com/health")).status).toBe(404);
});
it("requires the bearer token and rejects expiry", async () => {
  expect((await SELF.fetch("https://smoke-a.example.com/api/value")).status).toBe(401);
  expect((await SELF.fetch("https://smoke-a.example.com/api/value", { headers: { authorization: `Bearer ${"c".repeat(64)}` } })).status).toBe(401);
  const expired = await worker.fetch(new Request("https://smoke-a.example.com/api/value", { headers: auth }), { ...env, SMOKE_EXPIRES: "0" });
  expect(expired.status).toBe(401);
});
it("isolates host-selected SQLite data and can clear only the selected object", async () => {
  await SELF.fetch("https://smoke-a.example.com/api/value", { method: "POST", headers: auth, body: "a-value" });
  await SELF.fetch("https://smoke-b.example.com/api/value", { method: "POST", headers: auth, body: "b-value" });
  const a = await SELF.fetch("https://smoke-a.example.com/api/value?id=b", { headers: auth });
  expect((await a.json()).value).toBe("a-value");
  expect((await SELF.fetch("https://smoke-a.example.com/api/clear", { method: "POST", headers: auth })).status).toBe(204);
  expect((await (await SELF.fetch("https://smoke-a.example.com/api/value", { headers: auth })).json()).value).toBeNull();
  expect((await (await SELF.fetch("https://smoke-b.example.com/api/value", { headers: auth })).json()).value).toBe("b-value");
});
it("bounds synthetic writes and rejects unsupported methods", async () => {
  expect((await SELF.fetch("https://smoke-a.example.com/api/value", { method: "POST", headers: auth, body: "x".repeat(257) })).status).toBe(413);
  expect((await SELF.fetch("https://smoke-a.example.com/api/value", { method: "DELETE", headers: auth })).status).toBe(405);
});

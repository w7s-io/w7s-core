import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { expect, it } from "vitest";
import { createTestEnv } from "../../src/__tests__/mocks.ts";
import { recordUsageEvent, loadUsageDailyRollup, loadUsageOwnerDailyRollup,
  loadUsageGlobalDailyRollup, rebuildUsageAggregatesForDate, usageKey } from "../../src/usage.ts";
import { mergeCloudflareHourlyIntoDaily } from "../../src/cloudflareUsage.ts";
import { checkUsageLimit, usageLimitPolicyKey } from "../../src/usageLimits.ts";

it("persists concurrent increments atomically at all scopes and expires them", async () => {
  const ledger = env.USAGE_LEDGER.getByName(crypto.randomUUID());
  const at = new Date().toISOString();
  const date = at.slice(0, 10);
  const event = { at, metric: "runtime.request", repository: "org/app", environment: "production",
    orgSlug: "org", repoSlug: "app", count: 1, units: 2, outcome: "success", source: "w7s" };
  await Promise.all(Array.from({ length: 50 }, () => ledger.record(event)));
  for (const key of [`usage_daily:v1:${date}:production:org:app`,
    `usage_owner_daily:v1:${date}:production:org`, `usage_global_daily:v1:${date}:production`]) {
    const rollup = await ledger.getRollup(key);
    expect(rollup.metrics["runtime.request"]).toMatchObject({ count: 50, units: 100, success: 50, error: 0 });
  }
  await ledger.record({ ...event, orgSlug: "other", repoSlug: "app", outcome: "error" });
  expect((await ledger.getRollup(`usage_owner_daily:v1:${date}:production:org`)).metrics["runtime.request"].count).toBe(50);
  expect((await ledger.getRollup(`usage_global_daily:v1:${date}:production`)).metrics["runtime.request"].error).toBe(1);
  expect(await runInDurableObject(ledger, async (_instance, state) => await state.storage.getAlarm())).not.toBeNull();
  await runDurableObjectAlarm(ledger);
  expect(await ledger.getRollup(`usage_global_daily:v1:${date}:production`)).toBeNull();
  expect(await ledger.record({ ...event, at: "2000-01-01T00:00:00.000Z" })).toBe(false);
});

it("isolates environments and preserves latest timestamp for out-of-order events", async () => {
  const a = env.USAGE_LEDGER.getByName(crypto.randomUUID());
  const b = env.USAGE_LEDGER.getByName(crypto.randomUUID());
  const at = new Date().toISOString();
  const event = { at, metric: "log.write", repository: "org/app", environment: "production",
    orgSlug: "org", repoSlug: "app", count: 3, units: 3, outcome: "error" };
  const key = `usage_daily:v1:${at.slice(0, 10)}:production:org:app`;
  await a.record(event);
  await a.record({ ...event, at: at.slice(0, 10) + "T00:00:00.000Z" });
  expect((await a.getRollup(key)).updatedAt).toBe(at);
  expect(await b.getRollup(key)).toBeNull();
});

it("uses zero KV writes per event and combines legacy usage exactly once across collector rebuilds", async () => {
  const testEnv = createTestEnv({ USAGE_LEDGER: env.USAGE_LEDGER });
  const at = new Date();
  const params = { date: at.toISOString().slice(0, 10), environment: crypto.randomUUID(),
    orgSlug: "acme", repoSlug: "app", repository: "acme/app" };
  // Seed an actual pre-migration baseline using the legacy writer.
  await recordUsageEvent({ ...testEnv, USAGE_LEDGER: undefined }, {
    ...params, at, metric: "queue.delivery", units: 10, count: 10
  });
  let writes = 0;
  const originalPut = testEnv.DEPLOYMENTS_KV.put.bind(testEnv.DEPLOYMENTS_KV);
  testEnv.DEPLOYMENTS_KV.put = async (...args) => { writes++; return originalPut(...args); };
  await recordUsageEvent(testEnv, { ...params, at, metric: "queue.delivery", units: 3, count: 3 });
  expect(writes).toBe(0);
  for (const load of [loadUsageDailyRollup, loadUsageOwnerDailyRollup, loadUsageGlobalDailyRollup]) {
    expect((await load(testEnv, params)).metrics["queue.delivery"].count).toBe(13);
  }
  for (let i = 0; i < 2; i++) {
    await mergeCloudflareHourlyIntoDaily(testEnv, params);
    await rebuildUsageAggregatesForDate(testEnv, params);
    for (const load of [loadUsageDailyRollup, loadUsageOwnerDailyRollup, loadUsageGlobalDailyRollup]) {
      expect((await load(testEnv, params)).metrics["queue.delivery"].count).toBe(13);
    }
  }
  expect((await testEnv.DEPLOYMENTS_KV.get(usageKey(params), "json")).metrics["queue.delivery"].count).toBe(10);
  await testEnv.DEPLOYMENTS_KV.put(usageLimitPolicyKey({ scope: "repo", ...params }), JSON.stringify({
    version: 1, metrics: { "queue.delivery": { dailyUnits: 12, enforcement: "block" } }
  }));
  const check = await checkUsageLimit(testEnv, { ...params, at, metric: "queue.delivery", units: 1 });
  expect(check?.used).toBe(13);
});

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import type { UsageDailyRollup, UsageEvent } from "./usage";
import { usageKey, usageOwnerKey, usageGlobalKey } from "./usage";

export type LedgerEvent = Omit<UsageEvent, "at"> & { at: string; count: number; units: number };

// One object per environment/day. These are post-migration deltas only;
// legacy KV totals and Cloudflare collector snapshots remain separate.
export class UsageLedger extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS rollups (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }

  getRollup(key: string): UsageDailyRollup | null {
    const row = this.ctx.storage.sql.exec<{ value: string }>(
      "SELECT value FROM rollups WHERE key=?", key
    ).toArray()[0];
    return row ? JSON.parse(row.value) as UsageDailyRollup : null;
  }

  async record(event: LedgerEvent) {
    const date = event.at.slice(0, 10);
    const configured = Number(this.env.W7S_USAGE_RETENTION_DAYS);
    const days = Number.isFinite(configured) && configured > 0 ? configured : 14;
    const expiresAt = Date.parse(date) + (Math.min(90, Math.max(1, days)) + 1) * 86_400_000;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(expiresAt);
    const scopes = [
      { key: usageKey({ ...event, date }), orgSlug: event.orgSlug, repoSlug: event.repoSlug, repository: event.repository },
      { key: usageOwnerKey({ ...event, date }), orgSlug: event.orgSlug, repoSlug: "*", repository: `${event.orgSlug}/*` },
      { key: usageGlobalKey({ ...event, date }), orgSlug: "*", repoSlug: "*", repository: "*/*" }
    ];
    // No await between related writes: all three scopes commit atomically.
    this.ctx.storage.transactionSync(() => {
      for (const scope of scopes) {
        const rollup = this.getRollup(scope.key) ?? {
          version: 1, date, environment: event.environment,
          orgSlug: scope.orgSlug, repoSlug: scope.repoSlug, repository: scope.repository,
          metrics: {}, updatedAt: event.at
        } satisfies UsageDailyRollup;
        const metric = rollup.metrics[event.metric] ?? {
          count: 0, units: 0, success: 0, error: 0, lastAt: event.at
        };
        metric.count += event.count;
        metric.units += event.units;
        if (event.outcome === "error") metric.error += event.count;
        else metric.success += event.count;
        metric.lastAt = metric.lastAt > event.at ? metric.lastAt : event.at;
        if (event.source) metric.source = event.source;
        rollup.metrics[event.metric] = metric;
        rollup.updatedAt = rollup.updatedAt > event.at ? rollup.updatedAt : event.at;
        this.ctx.storage.sql.exec(
          "INSERT INTO rollups VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          scope.key, JSON.stringify(rollup)
        );
      }
    });
    return true;
  }

  alarm() {
    this.ctx.storage.sql.exec("DELETE FROM rollups");
  }
}

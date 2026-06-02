import type { Env } from "./env";
import { jsonError } from "./http";

const SERVICE_KEY = "w7s-io";
const PREAUTHORIZED_METRICS = new Set(["deploy"]);

type AccountResponse<T> = {
  status: "success" | "error";
  data?: T;
  error?: string;
  details?: Record<string, unknown>;
};

type Reservation = {
  id: string;
  status: string;
};

export type BillingReservation = {
  id: string;
};

const enabled = (env: Env) =>
  env.W7S_BILLING_ENABLED === "true" &&
  Boolean(env.W7S_ACCOUNT_SERVICE_ORIGIN?.trim()) &&
  Boolean(env.W7S_ACCOUNT_SERVICE_TOKEN?.trim());

const accountOrigin = (env: Env) => env.W7S_ACCOUNT_SERVICE_ORIGIN?.trim().replace(/\/+$/, "") ?? "";

const billingRequest = async <T>(
  env: Env,
  path: string,
  init: {
    method: "GET" | "POST";
    body?: unknown;
  }
) => {
  const response = await fetch(`${accountOrigin(env)}${path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${env.W7S_ACCOUNT_SERVICE_TOKEN ?? ""}`,
      "content-type": "application/json"
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  const payload = await response.json() as AccountResponse<T>;
  if (!response.ok || payload.status !== "success" || !payload.data) {
    const error = new Error(payload.error || "Billing request failed.");
    (error as Error & { status?: number; details?: Record<string, unknown> }).status = response.status || 502;
    (error as Error & { status?: number; details?: Record<string, unknown> }).details = payload.details;
    throw error;
  }
  return payload.data;
};

export const reserveBillingCredits = async (
  env: Env,
  params: {
    githubOwnerLogin: string;
    githubOwnerType?: "user" | "org";
    operation: string;
    amountCents: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }
): Promise<BillingReservation | Response | null> => {
  if (!enabled(env)) return null;
  try {
    const response = await billingRequest<{ reservation: Reservation }>(env, "/api/v1/internal/reservations", {
      method: "POST",
      body: {
        githubOwnerLogin: params.githubOwnerLogin,
        githubOwnerType: params.githubOwnerType ?? "org",
        serviceKey: SERVICE_KEY,
        operation: params.operation,
        amountCents: params.amountCents,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata ?? {}
      }
    });
    return { id: response.reservation.id };
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 402;
    return jsonError(error instanceof Error ? error.message : "Billing reservation failed.", status);
  }
};

export const captureBillingReservation = async (env: Env, reservation: BillingReservation | null) => {
  if (!reservation || !enabled(env)) return;
  await billingRequest<{ reservation: Reservation }>(
    env,
    `/api/v1/internal/reservations/${encodeURIComponent(reservation.id)}/capture`,
    { method: "POST" }
  );
};

export const refundBillingReservation = async (env: Env, reservation: BillingReservation | null) => {
  if (!reservation || !enabled(env)) return;
  await billingRequest<{ reservation: Reservation }>(
    env,
    `/api/v1/internal/reservations/${encodeURIComponent(reservation.id)}/refund`,
    { method: "POST" }
  );
};

export const reportBillableUsage = async (
  env: Env,
  params: {
    metric: string;
    repository: string;
    environment: string;
    orgSlug: string;
    repoSlug: string;
    units: number;
    source?: string;
    occurredAt?: Date;
  }
) => {
  if (!enabled(env) || PREAUTHORIZED_METRICS.has(params.metric)) return;
  const idempotencyKey = [
    "usage",
    params.environment,
    params.orgSlug,
    params.repoSlug,
    params.metric,
    params.occurredAt?.toISOString() ?? new Date().toISOString(),
    String(params.units)
  ].join(":");
  try {
    await billingRequest(env, "/api/v1/internal/usage-events", {
      method: "POST",
      body: {
        githubOwnerLogin: params.orgSlug,
        githubOwnerType: "org",
        serviceKey: SERVICE_KEY,
        metric: params.metric,
        units: params.units,
        source: params.source ?? "w7s",
        occurredAt: params.occurredAt?.getTime(),
        idempotencyKey,
        metadata: {
          repository: params.repository,
          environment: params.environment,
          orgSlug: params.orgSlug,
          repoSlug: params.repoSlug
        }
      }
    });
  } catch {
    // Billing usage reporting must not break self-hosted or already-served runtime paths.
  }
};

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyAppSuspended,
  notifyDeployResponse,
  notifyTelegramManager
} from "../notifications";
import { app } from "../worker";
import { createTestEnv } from "./mocks";

const telegramEnv = () =>
  createTestEnv({
    W7S_TELEGRAM_BOT_TOKEN: "bot-token",
    W7S_TELEGRAM_CHAT_ID: "12345",
    W7S_ADMIN_TELEGRAM_CHAT_ID: "12345"
  });

const deployRequest = () =>
  new Request("https://w7s.cloud/api/v1/deploy", {
    method: "POST",
    headers: {
      "x-github-repository": "w7s-io/demo",
      "x-github-branch": "main",
      "x-github-sha": "abcdef1234567890"
    }
  });

const deployRequestWithTelegram = () =>
  new Request("https://w7s.cloud/api/v1/deploy", {
    method: "POST",
    headers: {
      "x-github-repository": "w7s-io/demo",
      "x-github-branch": "main",
      "x-github-sha": "abcdef1234567890",
      "x-w7s-telegram-chat-id": "55555",
      "x-w7s-telegram-events": "deploy_success,app_suspended,payment_request"
    }
  });

describe("Telegram notifications", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when the platform Telegram bot is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await notifyTelegramManager(
      createTestEnv({ W7S_TELEGRAM_CHAT_ID: "12345" }),
      "deploy_success",
      "hello"
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("always sends manager notifications to the platform admin chat", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyTelegramManager(
      createTestEnv({ W7S_TELEGRAM_BOT_TOKEN: "bot-token" }),
      "deploy_success",
      "hello"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("63272048");
    expect(body.text).toBe("hello");
  });

  it("sends deployment warnings to the manager chat", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = telegramEnv();
    const response = Response.json({
      status: "success",
      data: {
        url: "https://demo.w7s.cloud/",
        deployment: {
          repository: "w7s-io/demo",
          environment: "production",
          branch: "main",
          commitSha: "abcdef1234567890",
          targets: {
            static: { fileCount: 2 },
            worker: { scriptName: "demo-worker" }
          }
        },
        deploymentWarnings: [
          {
            message: "backend/ was present, but W7S did not deploy a backend."
          }
        ]
      }
    });

    await notifyDeployResponse(env, deployRequest(), response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.telegram.org/botbot-token/sendMessage");
    const body = JSON.parse(String(init.body)) as { chat_id: string; text: string; parse_mode?: string };
    expect(body.chat_id).toBe("12345");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("*W7S deploy completed with warnings*");
    expect(body.text).toContain("*Repository:* `w7s-io/demo`");
    expect(body.text).toContain("*Targets:* `static 2 files, backend`");
    expect(body.text).toContain("*Deployment warnings:* `1`");
  });

  it("deduplicates repeated deploy error notifications", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = telegramEnv();
    const response = () =>
      Response.json(
        {
          status: "error",
          error: "Daily usage limit exceeded for deploy"
        },
        { status: 429 }
      );

    await notifyDeployResponse(env, deployRequest(), response());
    await notifyDeployResponse(env, deployRequest(), response());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates app suspension notifications per repository day", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = telegramEnv();
    const params = {
      environment: "production",
      orgSlug: "w7s-io",
      repoSlug: "demo",
      reason: "W7S free-tier limit exceeded for runtime.request.",
      metrics: [
        {
          metric: "runtime.request",
          status: "exceeded" as const,
          used: 10_001,
          limit: 10_000,
          remaining: 0,
          message: "runtime.request exceeded the daily limit."
        }
      ],
      resumeAfter: "2026-05-29T00:00:00.000Z",
      at: new Date("2026-05-28T12:00:00.000Z")
    };

    await notifyAppSuspended(env, params);
    await notifyAppSuspended(env, params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string; parse_mode?: string };
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain("*W7S app suspended*");
    expect(body.text).toContain("*Repository:* `w7s-io/demo`");
    expect(body.text).toContain("`runtime.request`: `10001/10000`");
  });

  it("falls back to readable plain text when Telegram rejects suspension Markdown", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(
        { ok: false, description: "Bad Request: can't parse entities" },
        { status: 400 }
      ))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = telegramEnv();

    await notifyAppSuspended(env, {
      environment: "production",
      orgSlug: "omattic",
      repoSlug: "seokeywordexplorer-com",
      reason: "Short-window usage limit exceeded for runtime.request at repo scope (300/300 used, requested 1).",
      metrics: [
        {
          metric: "runtime.request",
          status: "exceeded",
          used: 300,
          limit: 300,
          remaining: 0,
          message: "Short-window usage limit exceeded."
        }
      ],
      resumeAfter: "2026-06-06T03:56:00.948Z",
      at: new Date("2026-06-06T03:55:01.000Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { text: string; parse_mode?: string };
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { text: string; parse_mode?: string };
    expect(first.parse_mode).toBe("MarkdownV2");
    expect(first.text).toContain("Short\\-window");
    expect(second.parse_mode).toBeUndefined();
    expect(second.text).toContain("Short-window usage limit exceeded");
    expect(second.text).not.toContain("\\-");
    expect(second.text).not.toContain("\\.");
  });

  it("links a deploy action Telegram chat id to future repo alerts", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = createTestEnv({
      W7S_TELEGRAM_BOT_TOKEN: "bot-token"
    });
    const response = Response.json({
      status: "success",
      data: {
        url: "https://demo.w7s.cloud/",
        deployment: {
          orgSlug: "w7s-io",
          repoSlug: "demo",
          repository: "w7s-io/demo",
          environment: "production",
          branch: "main",
          commitSha: "abcdef1234567890",
          targets: {
            static: { fileCount: 2 }
          }
        }
      }
    });

    await notifyDeployResponse(env, deployRequestWithTelegram(), response);
    await notifyAppSuspended(env, {
      environment: "production",
      orgSlug: "w7s-io",
      repoSlug: "demo",
      reason: "W7S free-tier limit exceeded.",
      at: new Date("2026-05-28T12:00:00.000Z")
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as { chat_id: string; text: string; parse_mode?: string }
    );
    expect(bodies.map((body) => body.chat_id)).toEqual([
      "63272048",
      "55555",
      "63272048",
      "55555"
    ]);
    expect(bodies[1]?.parse_mode).toBe("MarkdownV2");
    expect(bodies[1]?.text).toContain("*W7S deploy succeeded*");
    expect(bodies[3]?.parse_mode).toBe("MarkdownV2");
    expect(bodies[3]?.text).toContain("*W7S app suspended*");
  });

  it("accepts platform bot deployment status updates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/w7s-io/demo") {
        return Response.json({ full_name: "w7s-io/demo" });
      }
      return Response.json({ ok: true, result: { message_id: 456 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = createTestEnv({
      W7S_TELEGRAM_BOT_TOKEN: "bot-token"
    });

    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/deploy/status", {
        method: "POST",
        headers: {
          authorization: "Bearer github-token",
          "content-type": "application/json",
          "x-github-repository": "w7s-io/demo",
          "x-github-branch": "main",
          "x-github-sha": "abcdef1234567890"
        },
        body: JSON.stringify({
          stage: "start",
          environment: "production",
          telegram: {
            chatId: "55555",
            events: "deploy_success,deploy_warning,deploy_error"
          },
          github: {
            repository: "w7s-io/demo",
            branch: "main",
            commitSha: "abcdef1234567890",
            commitMessage: "Add deploy status detail\n\nLong body should stay out",
            runUrl: "https://github.com/w7s-io/demo/actions/runs/123"
          }
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; data?: { notified?: number; telegramMessageId?: string } };
    expect(body.status).toBe("success");
    expect(body.data?.notified).toBe(2);
    expect(body.data?.telegramMessageId).toBe("456");

    const telegramBodies = fetchMock.mock.calls
      .filter((call) => String((call as unknown as [string, RequestInit])[0]).startsWith("https://api.telegram.org/"))
      .map((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as { chat_id: string; text: string; parse_mode?: string });
    expect(telegramBodies.map((entry) => entry.chat_id)).toEqual(["63272048", "55555"]);
    expect(telegramBodies[0]?.parse_mode).toBe("MarkdownV2");
    expect(telegramBodies[0]?.text).toContain("*W7S Deployment started*");
    expect(telegramBodies[0]?.text).toContain("*Repository:* `w7s-io/demo`");
    expect(telegramBodies[0]?.text).toContain("*Commit message:* Add deploy status detail");
    expect(telegramBodies[0]?.text).not.toContain("Long body should stay out");
  });

  it("edits the subscriber deployment status message when a message id is provided", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/w7s-io/demo") {
        return Response.json({ full_name: "w7s-io/demo" });
      }
      return Response.json({ ok: true, result: { message_id: 456 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = createTestEnv({
      W7S_TELEGRAM_BOT_TOKEN: "bot-token"
    });

    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/deploy/status", {
        method: "POST",
        headers: {
          authorization: "Bearer github-token",
          "content-type": "application/json",
          "x-github-repository": "w7s-io/demo",
          "x-github-branch": "main",
          "x-github-sha": "abcdef1234567890"
        },
        body: JSON.stringify({
          stage: "upload",
          environment: "production",
          telegram: {
            chatId: "55555",
            events: "deploy_success,deploy_warning,deploy_error",
            messageId: "456"
          },
          github: {
            repository: "w7s-io/demo",
            branch: "main",
            commitSha: "abcdef1234567890",
            runUrl: "https://github.com/w7s-io/demo/actions/runs/123"
          }
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { status: string; data?: { telegramMessageId?: string } };
    expect(body.status).toBe("success");
    expect(body.data?.telegramMessageId).toBe("456");

    const telegramCalls = fetchMock.mock.calls
      .filter((call) => String((call as unknown as [string, RequestInit])[0]).startsWith("https://api.telegram.org/"));
    expect(String((telegramCalls[0] as unknown as [string, RequestInit])[0])).toBe("https://api.telegram.org/botbot-token/sendMessage");
    expect(String((telegramCalls[1] as unknown as [string, RequestInit])[0])).toBe("https://api.telegram.org/botbot-token/editMessageText");
    const subscriberBody = JSON.parse(String((telegramCalls[1] as unknown as [string, RequestInit])[1].body)) as { chat_id: string; message_id: number; text: string };
    expect(subscriberBody.chat_id).toBe("55555");
    expect(subscriberBody.message_id).toBe(456);
    expect(subscriberBody.text).toContain("*W7S Uploading archive*");
  });

  it("handles Telegram webhook updates with setup instructions", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const env = createTestEnv({
      W7S_TELEGRAM_BOT_TOKEN: "bot-token",
      W7S_TELEGRAM_WEBHOOK_SECRET: "secret"
    });

    const response = await app.fetch(
      new Request("https://w7s.cloud/api/v1/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret"
        },
        body: JSON.stringify({
          message: {
            text: "/start",
            chat: { id: 77777, type: "private" },
            from: { id: 77777, username: "demo" }
          }
        })
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { chat_id: string; text: string; parse_mode?: string };
    expect(body.chat_id).toBe("77777");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.text).toContain('```\ntelegram-chat-id: "77777"\n```');
    expect(body.text).toContain('telegram-chat-id: "77777"');
    expect(body.text).toContain("w7s-io/w7s-cloud@v1");
  });
});

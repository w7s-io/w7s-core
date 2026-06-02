import { describe, expect, it } from "vitest";
import { enforceCookiePolicy, isAllowedSetCookie } from "../security";

describe("cookie policy", () => {
  it("allows host-only cookies", () => {
    expect(isAllowedSetCookie("__Host-session=abc; Path=/; Secure; HttpOnly", "w7s.cloud")).toBe(
      true
    );
  });

  it("blocks parent-domain cookies for the configured base domain", () => {
    expect(isAllowedSetCookie("session=abc; Domain=.w7s.cloud; Path=/", "w7s.cloud")).toBe(false);
    expect(isAllowedSetCookie("session=abc; Domain=w7s.cloud; Path=/", "w7s.cloud")).toBe(false);
  });

  it("removes unsafe parent-domain cookies from responses", () => {
    const response = new Response("ok", {
      headers: {
        "set-cookie": "session=abc; Domain=.w7s.cloud; Path=/"
      }
    });

    const secured = enforceCookiePolicy(response, "w7s.cloud");

    expect(secured.headers.get("set-cookie")).toBeNull();
    expect(secured.status).toBe(200);
    return expect(secured.text()).resolves.toBe("ok");
  });
});

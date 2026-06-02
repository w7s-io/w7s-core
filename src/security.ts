const setCookieHeader = "set-cookie";

const normalizeDomain = (domain: string) => domain.trim().toLowerCase().replace(/^\./, "");

const cookieDomain = (cookie: string) => {
  const parts = cookie.split(";").slice(1);
  for (const part of parts) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name.toLowerCase() === "domain") return normalizeDomain(valueParts.join("="));
  }
  return null;
};

const responseSetCookies = (headers: Headers) => {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);

  const cookie = headers.get(setCookieHeader);
  return cookie ? [cookie] : [];
};

export const isAllowedSetCookie = (cookie: string, baseDomain: string) => {
  const domain = cookieDomain(cookie);
  if (!domain) return true;
  return domain !== normalizeDomain(baseDomain);
};

export const enforceCookiePolicy = (response: Response, baseDomain = "w7s.cloud") => {
  const cookies = responseSetCookies(response.headers);
  if (cookies.length === 0) return response;

  const allowedCookies = cookies.filter((cookie) => isAllowedSetCookie(cookie, baseDomain));
  if (allowedCookies.length === cookies.length) return response;

  const headers = new Headers(response.headers);
  headers.delete(setCookieHeader);
  for (const cookie of allowedCookies) headers.append(setCookieHeader, cookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};

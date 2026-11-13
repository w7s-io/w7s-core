const hostname = process.env.HOSTNAME;
if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Invalid hostname');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Missing API token');
async function request(path, method = 'GET', data) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    const error = new Error(JSON.stringify(body.errors));
    error.codes = body.errors?.map(e => e.code) ?? [];
    throw error;
  }
  return body.result;
}
const get = path => request(path);
const zoneName = process.env.W7S_ZONE_NAME || 'w7s.cloud';
const zones = await get(`/zones?name=${encodeURIComponent(zoneName)}`);
if (zones.length !== 1) throw new Error('Expected one provider zone');
const zone = zones[0].id;
const fallbackPath = `/zones/${zone}/custom_hostnames/fallback_origin`;
let fallback;
try { fallback = await get(fallbackPath); }
catch (error) {
  if (!error.codes.includes(1551)) throw error;
  fallback = null;
}
if (process.env.ENSURE_ORIGIN === 'true') {
  const origin = `saas-origin.${zoneName}`;
  if (fallback?.origin && fallback.origin !== origin) throw new Error('Refusing to replace an existing fallback origin');
  const dnsPath = `/zones/${zone}/dns_records`;
  const records = await get(`${dnsPath}?name=${encodeURIComponent(origin)}`);
  if (records.length && (records.length !== 1 || records[0].type !== 'AAAA' || records[0].content !== '100::' || !records[0].proxied)) {
    throw new Error('Refusing to replace conflicting origin DNS');
  }
  const routePath = `/zones/${zone}/workers/routes`;
  const routes = await get(routePath);
  const route = routes.find(r => r.pattern === '*/*');
  if (route && route.script !== 'w7s-io') throw new Error('Refusing to replace conflicting SaaS route');
  if (!records.length) await request(dnsPath, 'POST', { type: 'AAAA', name: origin, content: '100::', proxied: true, ttl: 1 });
  if (!route) await request(routePath, 'POST', { pattern: '*/*', script: 'w7s-io' });
  if (!fallback) fallback = await request(fallbackPath, 'PUT', { origin });
}
console.log(JSON.stringify({ zone: zoneName, fallback }, null, 2));
const hosts = await get(`/zones/${zone}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
for (const host of hosts) {
  console.log(JSON.stringify({
    hostname: host.hostname, status: host.status,
    verificationErrors: host.verification_errors,
    ssl: { method: host.ssl?.method, status: host.ssl?.status, validationErrors: host.ssl?.validation_errors },
  }, null, 2));
}

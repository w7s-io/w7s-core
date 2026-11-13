const hostname = process.env.HOSTNAME;
if (!hostname || !/^[a-z0-9.-]+$/i.test(hostname)) throw new Error('Invalid hostname');
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Missing API token');
async function get(path) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(JSON.stringify(body.errors));
  return body.result;
}
const zoneName = process.env.W7S_ZONE_NAME || 'w7s.cloud';
const zones = await get(`/zones?name=${encodeURIComponent(zoneName)}`);
if (zones.length !== 1) throw new Error('Expected one provider zone');
const zone = zones[0].id;
const fallback = await get(`/zones/${zone}/custom_hostnames/fallback_origin`);
console.log(JSON.stringify({ zone: zoneName, fallback }, null, 2));
const hosts = await get(`/zones/${zone}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
for (const host of hosts) {
  console.log(JSON.stringify({
    hostname: host.hostname, status: host.status,
    verificationErrors: host.verification_errors,
    ssl: { method: host.ssl?.method, status: host.ssl?.status, validationErrors: host.ssl?.validation_errors },
  }, null, 2));
}

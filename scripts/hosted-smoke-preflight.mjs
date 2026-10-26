// Read-only access check. Never outputs credentials, DNS values, or certificate bodies.
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not configured");
const zone = process.env.SMOKE_ZONE_ID;
if (!/^[a-f0-9]{32}$/.test(zone ?? "")) throw new Error("SMOKE_ZONE_ID must be a Cloudflare zone ID");
let failed = false;
for (const endpoint of ["dns_records?per_page=1", "ssl/certificate_packs"]) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
    redirect: "error"
  });
  const result = await response.json();
  const success = response.ok && result.success === true;
  console.log(JSON.stringify({ check: endpoint.split("?")[0], status: response.status, success,
    errorCodes: result.errors?.map(error => error.code) ?? [] }));
  failed ||= !success;
}
if (failed) process.exitCode = 1;

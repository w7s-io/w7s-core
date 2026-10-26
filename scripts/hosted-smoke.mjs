import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { applicationScopedRepoSlug } from "../src/names.ts";

const { CLOUDFLARE_API_TOKEN: cfToken, GH_TOKEN: githubToken, SMOKE_ZONE_ID: zone,
  SMOKE_DOMAIN: domain, GITHUB_SHA: commit, GITHUB_REF_NAME: branch } = process.env;
assert(cfToken && githubToken && /^[a-f0-9]{32}$/.test(zone ?? ""));
assert(/^[a-z0-9-]+\.[a-z]+$/.test(domain ?? ""), "Use a dedicated apex zone");
assert(/^[a-f0-9]{40}$/.test(commit ?? "") && branch === "test/hosted-wildcard-smoke");
const repository = "w7s-io/w7s-core";
const token = randomBytes(32).toString("hex");
console.log(`::add-mask::${token}`);
const host = label => `${label}.${domain}`;
const applications = [
  { name: "hosted-smoke", environment: "smoke-live", cname: `*.${domain}`, hosts: { [host("smoke-a")]: "a", [host("smoke-b")]: "b" } },
  { name: "hosted-exact", environment: "smoke-live", cname: host("smoke-exact"), hosts: { [host("smoke-exact")]: "a" } },
  { name: "hosted-smoke", environment: "smoke-preview", cname: host("smoke-preview"), hosts: { [host("smoke-preview")]: "a" } }
];
const worker = await readFile(new URL("../tests/hosted/object-store.mjs", import.meta.url), "utf8");
const createdDns = [];
const attempted = new Set();
const routesBefore = new Set();
const results = [];
let cleanupFailed = false;
const check = label => { results.push(label); console.log(`PASS ${label}`); };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const http = (url, options = {}) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) });
async function cf(path, method = "GET", body) {
  const response = await http(`https://api.cloudflare.com/client/v4/zones/${zone}/${path}`, {
    method, headers: { authorization: `Bearer ${cfToken}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}, codes ${data.errors?.map(e => e.code).join(",")}`);
  return data;
}
async function deploy(app, revision, disabled = false) {
  const manifest = { name: app.name, routing: { defaultDomain: true, customDomainBranchMode: "direct" },
    bindings: { durableObjects: [{ binding: "OBJECTS", className: "SmokeStore" }] },
    secrets: ["SMOKE_TOKEN"] };
  const files = {
    "backend/index.js": `${worker}\n// Hosted test revision ${revision}\n`,
    "backend/wrangler.json": JSON.stringify({ compatibility_date: "2026-10-26" }),
    "w7s.json": JSON.stringify(manifest),
    ...(!disabled ? { CNAME: app.cname } : {})
  };
  const vars = { SMOKE_HOSTS: JSON.stringify(app.hosts), SMOKE_SERVICE: app.name, SMOKE_REVISION: revision,
    SMOKE_EXPIRES: String(disabled ? 0 : Date.now() + 20 * 60 * 1000) };
  attempted.add(app);
  const response = await http("https://w7s.cloud/api/v1/deploy", {
    method: "POST", headers: {
      authorization: `Bearer ${githubToken}`, "content-type": "application/zip",
      "x-github-repository": repository, "x-github-sha": commit, "x-github-branch": branch,
      "x-w7s-environment": app.environment,
      "x-w7s-vars": Buffer.from(JSON.stringify(vars)).toString("base64url"),
      "x-w7s-secrets": Buffer.from(JSON.stringify({ SMOKE_TOKEN: token })).toString("base64url")
    }, body: zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, strToU8(value)])))
  });
  const data = await response.json();
  if (!response.ok || data.status === "error") throw new Error(`W7S deploy ${app.name}/${app.environment}: HTTP ${response.status}: ${JSON.stringify(data).slice(0,1500)}`);
  const payload = data.data ?? data;
  assert.equal(payload.blockedCustomDomains?.length ?? 0, 0, "Domain claim blocked");
  console.log(JSON.stringify({ deployed: app.name, environment: app.environment, revision, disabled, script: payload.deployment?.targets?.worker?.scriptName }));
  return payload.deployment;
}
async function probe(label, path = "/api/value", method = "GET", body, authorized = true) {
  return http(`https://${host(label)}${path}`, { method,
    headers: authorized ? { authorization: `Bearer ${token}` } : {}, ...(body !== undefined ? { body } : {}) });
}
async function value(label, method = "GET", body) {
  const response = await probe(label, "/api/value", method, body);
  assert.equal(response.status, 200, `${label} ${method}`);
  return response.json();
}
async function health(app, revision) {
  const name = Object.keys(app.hosts)[0];
  let last;
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const response = await http(`https://${name}/health`);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.revision, revision);
      assert.equal(result.service, app.name);
      assert.equal(result.environment, app.environment);
      assert.equal(result.commitHash, commit);
      assert.equal(result.branch, branch);
      assert(Number.isFinite(Date.parse(result.deployedAt)));
      return;
    } catch (error) { last = error; await wait(5000); }
  }
  throw last;
}
try {
  const core = await (await http("https://w7s.cloud/health")).json();
  assert.equal(core.commitHash, "4ed83f94fb2c203681583ebba4be620f79282338");
  assert.equal(core.branch, "main");
  check("W7S deployed release metadata");
  const dns = await cf("dns_records?per_page=100");
  assert.equal(dns.result.length, 0, "Refuse to alter a zone with existing DNS records");
  const existingRoutes = (await cf("workers/routes")).result;
  assert.equal(existingRoutes.length, 0, "Refuse to alter a zone with existing routes");
  for (const route of existingRoutes) routesBefore.add(route.id);
  const packs = (await cf("ssl/certificate_packs")).result;
  assert(packs.some(pack => pack.status === "active" && pack.hosts.includes(`*.${domain}`)));
  check("Empty test zone and active first-level wildcard TLS");
  const allowed = [...new Set(applications.map(app => `w7s-io/${applicationScopedRepoSlug("w7s-core", app.name)}`))].join(",");
  for (const record of [
    { type: "TXT", name: `_w7s.${domain}`, content: allowed, ttl: 60 },
    { type: "A", name: `*.${domain}`, content: "192.0.2.1", proxied: true, ttl: 1 }
  ]) createdDns.push((await cf("dns_records", "POST", record)).result.id);
  // Wait for the same public resolver used by W7S claim authorization.
  let txtReady = false;
  for (let attempt = 0; attempt < 36; attempt++) {
    const result = await (await http(`https://cloudflare-dns.com/dns-query?name=_w7s.${domain}&type=TXT`, { headers: { accept: "application/dns-json" } })).json();
    if (result.Answer?.some(answer => answer.type === 16 && answer.data.includes(allowed))) { txtReady = true; break; }
    await wait(5000);
  }
  assert(txtReady, "TXT authorization did not propagate");
  const first = await deploy(applications[0], "v1");
  await health(applications[0], "v1");
  for (const app of applications.slice(1)) { await deploy(app, "v1"); await health(app, "v1"); }
  check("Wildcard, exact override, and preview HTTPS health");
  assert.equal((await probe("smoke-a", "/api/value", "GET", undefined, false)).status, 401);
  assert.equal((await probe("smoke-unknown", "/health")).status, 404);
  check("Unauthorized requests and unregistered host rejected");
  assert.equal((await value("smoke-a", "POST", "private-a")).value, "private-a");
  assert.equal((await value("smoke-b", "POST", "private-b")).value, "private-b");
  assert.equal((await value("smoke-a")).value, "private-a");
  assert.equal((await value("smoke-b")).value, "private-b");
  check("Two dynamically named SQLite objects remain isolated");
  assert.equal((await value("smoke-exact")).value, null);
  assert.equal((await value("smoke-exact", "POST", "exact-app")).service, "hosted-exact");
  assert.equal((await value("smoke-preview")).value, null);
  await value("smoke-preview", "POST", "preview-only");
  assert.equal((await value("smoke-a")).value, "private-a");
  check("Separate application and preview namespaces remain isolated");
  const second = await deploy(applications[0], "v2");
  assert(first?.targets?.worker?.scriptName);
  assert.equal(second.targets.worker.scriptName, first.targets.worker.scriptName);
  await health(applications[0], "v2");
  assert.equal((await value("smoke-a")).value, "private-a");
  assert.equal((await value("smoke-b")).value, "private-b");
  assert.equal((await value("smoke-exact")).value, "exact-app");
  assert.equal((await value("smoke-preview")).value, "preview-only");
  check("Real W7S redeployment retains SQLite data and exact-host overrides");
} finally {
  for (const app of attempted) {
    for (const name of Object.keys(app.hosts)) {
      try { await probe(name.split(".")[0], "/api/clear", "POST"); } catch { /* DNS may not have propagated. */ }
    }
    try { await deploy(app, "disabled", true); } catch (error) { cleanupFailed = true; console.error(`Disable failed: ${error.message}`); }
  }
  const patterns = new Set(applications.map(app => `${app.cname}/*`));
  try {
    if (attempted.size > 0) {
    for (const route of (await cf("workers/routes")).result) {
      if (!routesBefore.has(route.id) && patterns.has(route.pattern) && route.script === "w7s-io") await cf(`workers/routes/${route.id}`, "DELETE");
    }
    }
  } catch (error) { cleanupFailed = true; console.error(`Route cleanup failed: ${error.message}`); }
  for (const id of createdDns) {
    try { await cf(`dns_records/${id}`, "DELETE"); } catch (error) { cleanupFailed = true; console.error(`DNS cleanup failed: ${error.message}`); }
  }
  console.log(JSON.stringify({ checksPassed: results, cleanupFailed, retained: "Disabled test workers and namespaces; no customer data" }));
  if (cleanupFailed) process.exitCode = 1;
}

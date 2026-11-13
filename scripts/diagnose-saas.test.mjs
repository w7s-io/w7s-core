import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const scenario of ['read-only', 'create', 'existing', 'dns-conflict', 'route-conflict', 'origin-conflict', 'auth-error']) {
  test(scenario, async () => {
    const originalFetch = globalThis.fetch;
    const savedEnv = { ...process.env };
    const writes = [];
    process.env.HOSTNAME = 'customer.example';
    process.env.CLOUDFLARE_API_TOKEN = 'test-only';
    process.env.W7S_ZONE_NAME = 'w7s.cloud';
    process.env.ENSURE_ORIGIN = scenario === 'read-only' ? 'false' : 'true';
    globalThis.fetch = async (url, init) => {
      const path = new URL(url).pathname;
      if (init.method !== 'GET') {
        writes.push({ path, method: init.method, body: JSON.parse(init.body) });
        return Response.json({ success: true, result: { origin: 'saas-origin.w7s.cloud', status: 'pending' } });
      }
      let result = [];
      if (path.endsWith('/zones')) result = [{ id: 'zone' }];
      if (path.endsWith('/fallback_origin')) {
        if (scenario === 'auth-error') return Response.json({ success: false, errors: [{ code: 10000 }] }, { status: 403 });
        if (scenario === 'existing' || scenario === 'origin-conflict') result = { origin: scenario === 'existing' ? 'saas-origin.w7s.cloud' : 'other.w7s.cloud' };
        else return Response.json({ success: false, errors: [{ code: 1551 }] }, { status: 404 });
      }
      if (path.endsWith('/dns_records') && ['existing', 'dns-conflict'].includes(scenario)) result = [{ type: 'AAAA', content: scenario === 'existing' ? '100::' : '2001:db8::1', proxied: true }];
      if (path.endsWith('/routes') && ['existing', 'route-conflict'].includes(scenario)) result = [{ pattern: '*/*', script: scenario === 'existing' ? 'w7s-io' : 'another-worker' }];
      return Response.json({ success: true, result });
    };
    try {
      const run = import(`./diagnose-saas.mjs?test=${scenario}`);
      if (scenario.endsWith('conflict') || scenario === 'auth-error') await assert.rejects(run);
      else await run;
      assert.equal(writes.length, scenario === 'create' ? 3 : 0);
      if (scenario === 'create') {
        assert.deepEqual(writes.map(w => w.method), ['POST', 'POST', 'PUT']);
        assert.equal(writes[1].body.pattern, '*/*');
        assert.equal(writes[2].body.origin, 'saas-origin.w7s.cloud');
      }
    } finally {
      globalThis.fetch = originalFetch;
      process.env = savedEnv;
    }
  });
}

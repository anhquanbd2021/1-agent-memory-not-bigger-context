import test from 'node:test';
import assert from 'node:assert/strict';
import { startProduction } from '../app/server.js';

test('server serves the lab, health, and version; rejects traversal', async () => {
  const { server, close } = await startProduction({ port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/guide.html', '/styles.css', '/app.js', '/memory.mjs', '/scenario.mjs']) {
      const r = await fetch(base + path);
      assert.equal(r.status, 200, path);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    }
    const health = await fetch(`${base}/health`);
    assert.equal(await health.text(), 'ok');
    const version = await (await fetch(`${base}/version`)).json();
    assert.equal(version.name, 'agent-memory-write-gate-demo');
    assert.equal((await fetch(`${base}/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 404);
  } finally {
    await close();
  }
});

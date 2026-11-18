'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

let child; let base;
test('ScholarSetu API smoke tests', async t => {
  const port = 3100 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(ready, true, 'server should start');
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.status, 'ok');
  const schemes = await (await fetch(`${base}/api/scholarships`)).json();
  assert.equal(schemes.count, 6);
  const punjab = await (await fetch(`${base}/api/portals?q=Punjab`)).json();
  assert.equal(punjab.count, 1);
  assert.equal(punjab.items[0].state, 'Punjab');
  const bad = await fetch(`${base}/api/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'no' }) });
  assert.equal(bad.status, 400);
});

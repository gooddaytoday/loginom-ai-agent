import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseConnection, agentVersionSupported } from '../lib/diagnostics.mjs';
import { manifestRevision } from '../lib/skill.mjs';
import { createHash } from 'node:crypto';

test('diagnostics separate Dock authentication from Loginom reachability and never forward the key', async () => {
  const config = { endpoint: 'https://dock.example/mcp', apiKey: 'control-key', loginomUrl: 'https://loginom.example/?testable=true' };
  const content = '# Verified skill';
  const sha = createHash('sha256').update(content).digest('hex');
  const files = [{ path: 'SKILL.md', is_dir: false, sha256: sha, size: Buffer.byteLength(content), uri: 'viking://agent/skills/loginom-automation/SKILL.md' }];
  const manifest = async () => ({ content, content_sha256: sha, files, revision: manifestRevision(files) });
  let keyAccepted = true, missingSource = false, targetStatus = 200;
  const fetcher = async (url, options) => {
    url = new URL(url);
    if (url.origin === 'https://loginom.example') {
      assert.equal(options.headers, undefined);
      assert.equal(options.redirect, 'manual');
      return new Response('', { status: targetStatus });
    }
    assert.equal(url.origin, 'https://dock.example');
    assert.equal(options.headers.Authorization, 'Bearer control-key');
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/health') return keyAccepted
      ? Response.json({ healthy: true, account_id: 'loginom-dock', user_id: 'loginom-dock', role: 'user' })
      : Response.json({}, { status: 401 });
    return Response.json({ status: missingSource ? 'error' : 'ok' });
  };
  const good = await diagnoseConnection(config, { fetcher, manifest, platform: 'darwin' });
  assert.equal(good.ok, true);
  assert.equal(good.checks.loginom.browserLogin, 'not_checked');
  const noDisplay = await diagnoseConnection(config, { fetcher, manifest, platform: 'linux', environment: {} });
  assert.equal(noDisplay.ok, false);
  assert.equal(noDisplay.checks.server.ok, true);
  assert.equal(noDisplay.checks.browserEnvironment.ok, false);
  for (const environment of [{ DISPLAY: ':1' }, { WAYLAND_DISPLAY: 'wayland-0' }]) {
    const withDisplay = await diagnoseConnection(config, { fetcher, manifest, platform: 'linux', environment });
    assert.equal(withDisplay.ok, true);
    assert.equal(withDisplay.checks.browserEnvironment.browserLaunch, 'not_checked');
  }
  keyAccepted = false;
  const denied = await diagnoseConnection(config, { fetcher, manifest, platform: 'darwin' });
  assert.equal(denied.ok, false); assert.match(denied.checks.server.message, /ключ/i);
  assert.equal(denied.checks.sources, undefined);
  keyAccepted = true; missingSource = true;
  assert.equal((await diagnoseConnection(config, { fetcher, manifest, platform: 'darwin' })).checks.sources.ok, false);
  targetStatus = 302;
  assert.equal((await diagnoseConnection(config, { fetcher, manifest, platform: 'darwin' })).checks.loginom.ok, false);
  assert.equal((await diagnoseConnection({ ...config, loginomUrl: 'https://loginom.example/' }, { fetcher, manifest, platform: 'darwin' })).checks.loginom.ok, false);
});

test('agent compatibility rejects absent, older and unvalidated major versions', () => {
  assert.equal(agentVersionSupported('codex', 'codex-cli 0.149.1'), true);
  assert.equal(agentVersionSupported('codex', 'codex-cli 0.148.9'), false);
  assert.equal(agentVersionSupported('codex', 'codex-cli 1.0.0'), false);
  assert.equal(agentVersionSupported('hermes', 'Hermes v0.21.0 (2026.8.31)'), true);
  assert.equal(agentVersionSupported('hermes', 'not installed'), false);
});

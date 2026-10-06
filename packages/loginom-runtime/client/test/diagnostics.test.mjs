import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseConnection, agentVersionSupported } from '../lib/diagnostics.mjs';
import { createBundledSkillFixture } from './support/bundled-skill-fixture.mjs';

test('diagnostics read the local product skill independently of the Skills API and Dock availability', async t => {
  const source = await createBundledSkillFixture(t);
  const config = { resources: source.resources, endpoint: 'https://dock.example/mcp', apiKey: 'test-only', loginomUrl: 'https://loginom.example/?testable=true' };
  let manifestRequests = 0;
  for (const available of [true, false]) {
    const result = await diagnoseConnection(config, { platform: 'linux', environment: { DISPLAY: ':1' },
      manifest() { manifestRequests++; throw Error('Skills API must not be called'); },
      fetcher: async url => {
        url = new URL(url);
        assert.notEqual(url.pathname, '/api/v1/skills/loginom-automation');
        if (url.pathname === '/health') return available
          ? Response.json({ healthy: true, account_id: 'loginom-dock', user_id: 'loginom-dock', role: 'user' })
          : Response.json({}, { status: 503 });
        return url.origin === 'https://loginom.example' ? new Response('') : Response.json({ status: 'ok' });
      },
    });
    assert.equal(manifestRequests, 0);
    assert.equal(result.checks.skill.ok, true);
    assert.equal(result.checks.skill.source, 'bundled');
    assert.match(result.checks.skill.revision, /^[a-f0-9]{64}$/);
    assert.equal(result.checks.server.ok, available);
  }
});

test('diagnostics separate Dock authentication from Loginom reachability and never forward the key', async t => {
  const source = await createBundledSkillFixture(t);
  const config = { resources: source.resources, endpoint: 'https://dock.example/mcp', apiKey: 'control-key', loginomUrl: 'https://loginom.example/?testable=true' };
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
  const good = await diagnoseConnection(config, { fetcher, platform: 'darwin' });
  assert.equal(good.ok, true);
  assert.equal(good.checks.loginom.browserLogin, 'not_checked');
  const noDisplay = await diagnoseConnection(config, { fetcher, platform: 'linux', environment: {} });
  assert.equal(noDisplay.ok, false);
  assert.equal(noDisplay.checks.server.ok, true);
  assert.equal(noDisplay.checks.browserEnvironment.ok, false);
  for (const environment of [{ DISPLAY: ':1' }, { WAYLAND_DISPLAY: 'wayland-0' }]) {
    const withDisplay = await diagnoseConnection(config, { fetcher, platform: 'linux', environment });
    assert.equal(withDisplay.ok, true);
    assert.equal(withDisplay.checks.browserEnvironment.browserLaunch, 'not_checked');
  }
  keyAccepted = false;
  const denied = await diagnoseConnection(config, { fetcher, platform: 'darwin' });
  assert.equal(denied.ok, false); assert.match(denied.checks.server.message, /ключ/i);
  assert.equal(denied.checks.sources, undefined);
  keyAccepted = true; missingSource = true;
  assert.equal((await diagnoseConnection(config, { fetcher, platform: 'darwin' })).checks.sources.ok, false);
  targetStatus = 302;
  assert.equal((await diagnoseConnection(config, { fetcher, platform: 'darwin' })).checks.loginom.ok, false);
  assert.equal((await diagnoseConnection({ ...config, loginomUrl: 'https://loginom.example/' }, { fetcher, platform: 'darwin' })).checks.loginom.ok, false);
});

test('agent compatibility rejects absent, older and unvalidated major versions', () => {
  assert.equal(agentVersionSupported('codex', 'codex-cli 0.149.1'), true);
  assert.equal(agentVersionSupported('codex', 'codex-cli 0.148.9'), false);
  assert.equal(agentVersionSupported('codex', 'codex-cli 1.0.0'), false);
  assert.equal(agentVersionSupported('hermes', 'Hermes v0.21.0 (2026.8.31)'), true);
  assert.equal(agentVersionSupported('hermes', 'not installed'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('MCP bridge clipboard shutdown contract uses real isolated kernel leases', async () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--test',
    '--test-reporter=tap', fileURLToPath(new URL('./support/p4-clipboard-shutdown.mjs', import.meta.url))],
  { timeout: 30000, env });
  assert.match(result.stdout, /# pass 5\b/);
  assert.match(result.stdout, /# fail 0\b/);
});

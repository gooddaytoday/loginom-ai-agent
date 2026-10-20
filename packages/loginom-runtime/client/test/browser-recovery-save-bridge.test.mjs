import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('browser recovery rereads an unconfirmed saved package state through the managed bridge', async () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--test',
    fileURLToPath(new URL('./support/browser-recovery-save-bridge.mjs', import.meta.url))], { env, timeout: 60000 })
    .catch(error => error);
  assert.match(result.stdout, /pass 2/, result.stdout + result.stderr);
  assert.match(result.stdout, /fail 0/);
});

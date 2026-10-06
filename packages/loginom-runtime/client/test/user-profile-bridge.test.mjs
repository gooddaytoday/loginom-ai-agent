import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('managed user bridge prepares with the real product skill', async () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await promisify(execFile)(process.execPath, ['--experimental-test-module-mocks', '--test',
    fileURLToPath(new URL('./support/user-profile-bridge.mjs', import.meta.url))], { env, timeout: 30000 });
  assert.match(result.stdout, /pass 1/);
  assert.match(result.stdout, /fail 0/);
});

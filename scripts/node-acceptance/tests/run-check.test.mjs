import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

test('run-check Python regression suite', () => {
  const result = spawnSync('python3', ['-B', '-m', 'unittest', 'test_run_check', 'test_run_check_build', 'test_catalog_delta', '-v'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

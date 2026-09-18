import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { browserEnvironment } from '../../src/connection-check.mjs';

test('Chromium diagnostics stay in the mutable browser profile', () => {
  const profile = join('C:\\state', 'browser-profile');
  const input = { SYSTEMROOT: 'C:\\Windows', CHROME_LOG_FILE: 'C:\\immutable\\debug.log' };
  const result = browserEnvironment(profile, input);
  assert.equal(result.CHROME_LOG_FILE, join(profile, 'chrome-debug.log'));
  assert.equal(result.SYSTEMROOT, input.SYSTEMROOT);
  assert.equal(input.CHROME_LOG_FILE, 'C:\\immutable\\debug.log');
});

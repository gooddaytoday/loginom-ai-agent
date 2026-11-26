import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRecoveryReadDeadline, savedPackageRecoveryTimeout, EXPORT_RECOVERY_READ_MS, SAVED_PACKAGE_READ_MS } from '../lib/recovery-time.mjs';

test('export and save verification stay inside the remaining attempt time and their existing limits', () => {
  const now = () => 1_000_000;
  assert.equal(EXPORT_RECOVERY_READ_MS, 120_000);
  assert.equal(SAVED_PACKAGE_READ_MS, 15_000);
  assert.equal(exportRecoveryReadDeadline(now, 4_000), 1_004_000);
  assert.equal(exportRecoveryReadDeadline(now, 600_000), 1_000_000 + 120_000);
  assert.equal(exportRecoveryReadDeadline(now, 0), 1_000_000);
  assert.equal(savedPackageRecoveryTimeout(4_000), 4_000);
  assert.equal(savedPackageRecoveryTimeout(600_000), 15_000);
  assert.equal(savedPackageRecoveryTimeout(undefined), 15_000);
  assert.equal(savedPackageRecoveryTimeout(0), 0);
});

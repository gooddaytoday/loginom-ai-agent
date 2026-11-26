// Verification spends the attempt's remaining time and keeps the shorter
// Loginom read limits that already exist. It does not add a separate budget.
export const EXPORT_RECOVERY_READ_MS = 120_000;
export const SAVED_PACKAGE_READ_MS = 15_000;

export function cappedRecoveryMs(limit, remainingMs) {
  const remaining = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : limit;
  return Math.min(limit, remaining);
}

export function exportRecoveryReadDeadline(now, remainingMs) {
  return now() + cappedRecoveryMs(EXPORT_RECOVERY_READ_MS, remainingMs);
}

export function savedPackageRecoveryTimeout(remainingMs) {
  return cappedRecoveryMs(SAVED_PACKAGE_READ_MS, remainingMs);
}

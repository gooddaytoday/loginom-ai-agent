# Loginom accounts-only preparation (LAB53)

This is a **source-only, non-deployable candidate**. It does not establish live
pair readiness or complete LAB53. The installed accounts tool is unchanged.
Both live entry points stop with `BLOCKED_FINITE_SERVER_CLEANUP` before any
Loginom call. No runtime flag or uncalibrated receipt can enable them.

The exact installed source snapshot is retained in `baseline/`, including
VERSION, README and the three original scripts with proxy and sandbox patches.
The historical c1b73577f label and archive digest are provenance labels; the
unavailable historical archive was not requalified. Baseline file digests are
verified against `baseline/SOURCE_SNAPSHOT.json`. CLI597 and native Multica are
separate artifacts.

`scripts/common.py` provides a permanent account flock, rereads both legacy
marker paths and config hash/device/inode after acquisition, and checks exact
previous per-account PID/start_ticks records. Any retained active marker blocks,
including a marker claiming cleanup. The canonical writer uses
`<account>.active.json` with explicit schema, issue, attempt, role, source,
writer and lock identity. It never migrates or deletes old state. Exact process
checks do not claim a machine-wide census or server absence. History discovery
and independent receipts are still required before live activation.

`scripts/account-ui.mjs` is the single navigation implementation for Users,
Dispatcher and refresh. It observes qualified main/AdminStart candidates before
gestures, uses visible Ext record readiness, and rejects ambiguous or unknown
scopes. It opens a hidden navigator and expands a collapsed Admin folder within
the observed scope. It preserves the original deadline. Diagnostics snapshots
are private (0700 directory, immutable 0600 files), with phase/action/selector,
candidates, elapsed time, native error accessors, message, stack and cause.
Public receipts contain only allowlisted codes and evidence digests.

`scripts/qualify-accounts.mjs` holds the common finite-cleanup gate and pair
binding validation. The original provisioning body is retained behind the gate
as an incremental base; its probe/creation lifecycle is **not qualified**.
Rights/identity/logout, complete Dispatcher readback and final server/process/FD
receipts still need integration and live validation once access is established.
Changing the hard stop alone would be unsafe and is not deployment.

`--issue`, `--operator`, `--directory`, `--stage stage0` and persisted pair
credentials retain their meanings. Provider/full mode is rejected.
`--allocate-only` continues to persist a planned pair without Loginom calls;
LAB53 has not used it on real account configs. Existing role/operator binding,
creation uncertainty and password preservation remain enforced.

## Offline validation

Run from this directory, never the repository root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Run `tests/account-ui.test.mjs` with `--test` using the pinned Node executable
from the private operator config. The tests read only its Node/Chromium/
Playwright dependency paths. Chromium runs with sandbox and default certificate
verification; network requests are aborted and cause failure. Fixtures are
synthetic layouts with observed data-tids, not recorded private DOM. Optional
`LAB53_OFFLINE_RECEIPT` writes exact owned browser PID/start_ticks and absence
after shutdown to a new private file. Python tests use actual flock and inherited
child descriptors, plus isolated synthetic configs and markers.

## Installation and rollback

`VERSION.json` binds candidate file digests and marks live qualification pending.
No install is authorized for this incomplete candidate. After finite cleanup,
qualification and independent review, prepare a new exact-SHA immutable bundle,
read back every file digest, and retain the installed version plus backup.
Do not overwrite the global CLI launcher, operator configs, credentials, account
locks, markers or histories. A rollback restores only the verified accounts tool
files and version metadata from the retained installed bundle; it must never
restore older mutable account state. Baseline files here are source evidence,
not proof that rollback has run. Installation and rollback remain NOT_RUN.

See `finite-cleanup.md` for the remaining access dependency. After common
preparation/cleanup proof and independent review, the same eight cards resume
under the existing authorization. No additional owner launch approval is needed;
merge, release and changes to shared contracts remain separate decisions.

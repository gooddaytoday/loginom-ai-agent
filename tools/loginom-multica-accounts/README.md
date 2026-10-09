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

`preparation_guard` returns the held admin/worker/reviewer guards and pair flock,
and requires explicit exact previous process records for every account. Planned
identities are locked before allocation; an existing pair is read under its pair
lock. Allocation reuses that FD. New configs are bound before all three UNKNOWN
effects are fsynced. `run_foreground` passes all four FDs through exec barriers:
the isolated supervisor and command PID/start_ticks and guards envelope are
saved before the command can act. The per-operation Linux supervisor is a
subreaper, not a daemon or queue. Kernel child lists and orphan adoption establish
exact descendant ownership across threads, `setsid()` and rapid double-fork;
PGID/SID and account/FD resemblance do not establish ownership. WNOWAIT retains
exited children until their provenance is saved. Timeout/cancellation signals
only exact owned identities through pidfds, reaps children, checks the kernel
has no children left and retains parent guards through supervisor shutdown.
Success with a surviving child is rejected even after local cleanup. Unsupported
supervision or incomplete provenance/cleanup remains UNKNOWN and cannot return
PASS. Immutable evidence and UNKNOWN markers are retained. The caller/Multica
daemon does not become a subreaper. Local cleanup never authorizes reuse.

`scripts/account-lifecycle.mjs` connects pair/operator bindings, recorded effect,
provision/login, unique connected identity, the existing effective rights policy
and Logout/Disconnect through explicit adapter hooks. Failure retains its cause;
cleanup does not extend the original deadline. A successful UI component returns
`UI_QUALIFIED_CLEANUP_PENDING`, `ready: false`. The final readback validator checks
fresh complete rows/counts/packages, observer calibration and exact own effects.
It is a component validator, not live authorization.

The fixed qualification-coordinator.py / qualify-preparation.mjs production entry is separate from the closed ordinary gates. It checks source, owner/config binding, real parent lineage, four inherited OFDs and seccomp; direct or invalid admission fails. See parent-readback-plan.md for the exact commands.
`preparation-runtime.mjs` uses a fixed private before/during capture provider,
never an arbitrary callback. Admin positive/causal capture occurs before Users
or provisioning. Both admin effects and the worker/reviewer effects contribute
logout receipts; the parent coordinator retains all four guards through exact
owned process cleanup and a new final readback. `finalize-preparation.mjs` is a
read-only foreground collector without account FDs, browser or Loginom calls.
`owner-archive.py` verifies the consumed proof and exact canonical marker/config/
permanent-lock/writer identity before preserving original marker bytes in history.
Only the fully proved pair transition writes `account_state=ready`; partial UI,
process, logout or server facts cannot reach it. A ready-write failure retains
history and restores original values under UNKNOWN markers. Unbound historical
legacy markers always block preparation. The separate owner-reconcile.py route requires new held-lock process/FD/config/marker proof and a fresh bound parent account-bucket response before original-byte archival; missing provenance remains UNKNOWN.

The child inherits a kernel seccomp barrier installed in its isolated supervisor
which forbids all flock syscalls, including unlock/relock on duplicated FDs.
The parent's held OFDs remain outside that barrier. The capture provider checks
actual lineage, source/file hashes, command, barrier program and kernel FD locks.
Native instrumentation installed before own Login observes connection/container/
connector fields, calls and error callbacks, including saved vendor Reconnect;
WebSocket count is only supplementary transport evidence. Missing source shape
or incomplete lifetime provenance is UNKNOWN. The production page also requires
exact loaded vendor response bytes before Login; changed, bundled or unavailable
bytes fail closed pending explicit source/runtime qualification.

The parent uses its existing Mac Admin tab through ordinary private handoff;
there is no new endpoint, queue, observer or shared Host/Agent contract. Each
phase has a new operation-bound nonce and pins the authorized tab/observer tuple.
The complete loaded Dispatcher collector uses the actual Ext form/controller/
store path without requiring data-tid. All client, shared/pool and package rows
are preserved; virtual rows have no invented user/GUID/numeric ID. Unqualified
mstBackup or unknown shapes reject the full snapshot. See
`parent-readback-plan.md` for formats, exact owner baseline and qualification.

This source implementation and its offline fixtures are not runtime acceptance.
Both public gates, the installed tool, real configs/markers and historical
attempts remain unchanged. No source fixture receipt enables live operation.
`--issue`, `--operator`, `--directory`, `--stage stage0` and persisted pair
credentials retain their meanings. Provider/full mode is rejected.
Non-allocation lifecycle requires a new absolute private `--evidence-dir`, an
explicit private `--previous-processes` per-account mapping, exact
`--source-sha`, new `--operation-id` and private `--parent-binding-file`. These inputs cannot bypass either public gate. The Node child
also receives both pair config paths, evidence-dir and the inherited guards
envelope. All inputs are still behind the unconditional public hard stop.
`--allocate-only` continues to persist a planned pair without Loginom calls;
LAB53 has not used it on real account configs. Existing role/operator binding,
creation uncertainty and password preservation remain enforced.

## Offline validation

Run from this directory, never the repository root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The strict FD positive test runs the exact executable collector with a real
guardian/flock/control in an isolated user/PID/mount namespace (`unshare` with
its real mounted `/proc`). Complete stable visibility and zero errors are
required; unavailable namespace support fails this test rather than skipping.
This is privileged visibility within the fixture namespace, not a host-wide
census or server absence. A real extra target FD rejects. Unprivileged host
denials/races and malformed/incomplete proofs remain UNKNOWN. The collector
holds `os.scandir` through every FD stat; no error or PID is filtered for PASS.

Run `tests/account-ui.test.mjs` with `--test` using the pinned Node executable
from the private operator config. The tests read only its Node/Chromium/
Playwright dependency paths. Chromium runs with sandbox and default certificate
verification; network requests are aborted and cause failure. Fixtures are
synthetic layouts, including an Ext Dispatcher without data-tids and complete
shared/pool rows. They contain no private recorded DOM. Optional
`LAB53_OFFLINE_RECEIPT` writes exact owned browser PID/start_ticks and absence
after shutdown to a new private file. Python tests use actual flock and inherited
child descriptors, plus isolated synthetic configs and markers. Detached
children are exercised at success, timeout and cancellation, including a
SIGTERM-resistant leaf and rapid double-fork. Each case checks exact descendant
absence, all four flock releases, unchanged UNKNOWN markers and an unrelated
live process that must remain untouched.

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

See `finite-cleanup.md` for the existing Mac Admin calibration and
`parent-readback-plan.md` for the source component boundary. After common
preparation/cleanup proof and independent review, the same eight cards resume
under the existing authorization. No additional owner launch approval is needed;
merge, release and changes to shared contracts remain separate decisions.

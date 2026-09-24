# CI release 0.1.12 — 2026-09-24

Source: `7cf322f72696506282a823c7124b79145a98c664`, annotated tag `v0.1.12`,
branch `loginom`. Root/Desktop manifests and `bun.lock` synchronized by
`script/set-version.ts`; frozen install and 32 pre-push typecheck tasks passed.
Branch and tag pushed atomically. Unrelated weekly report was not included.

## Runs

- [Release](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35990143921):
  **PASS on attempt 3**. All required jobs passed: verify, unit, Desktop,
  e2e, typecheck, Linux/Windows/macOS builds, Linux matrix and release.
  The `cut` job is intentionally skipped for a tag-triggered run.
- [Branch tests](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35990143671):
  PASS on attempt 3, including unit/Desktop/e2e.
- [Typecheck](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35990143643): PASS.
- [Windows native checks](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35990143591): PASS.
- [macOS candidate](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35990143698): PASS.

## Final artifacts

[Draft pre-release v0.1.12](https://github.com/gooddaytoday/loginom-ai-agent/releases/tag/untagged-146dccec835c397288cb)
contains 30 assets: Desktop installers/archives and standalone CLI for Linux
x64, Windows x64 and macOS arm64, source archives, manifests and reports.

All 29 entries of `SHA256SUMS.txt` match the corresponding GitHub asset digests.
Downloaded JSON/checksum files were independently hashed and matched their
GitHub digests. The three Desktop manifests have version `0.1.12`, source
`7cf322f72696506282a823c7124b79145a98c664` and `dirty: false`; their artifact
hashes agree with SHA256SUMS. Binary payloads were verified by native CI and
release aggregation; they were not independently downloaded and rehashed locally.

Static DEB/AppImage/NSIS/DMG/ZIP reports, macOS source/build/offline reports:
PASS. Linux offline non-root matrix: Ubuntu 22.04/24.04/26.04 and Debian 12/13,
5/5 PASS. macOS offline smoke includes Desktop onboarding/normal exit and CLI
help/version with system-only PATH.

## Retry evidence

All retries use the same source commit; tests and production code were not
modified to obtain successful results.

- Release attempt 1: Windows `apps.test.ts` exceeded the 5s test limit while
  waiting for `where.exe`. The subsequent assertion followed cancellation of
  the child. These files are unchanged from 0.1.11; historical runs passed.
  The same tests passed on attempt 2.
- Release attempt 1: macOS CLI build hit its 600s command timeout before native
  compilation logs. The process sample showed an idle Bun event loop; the exact
  await was not established. The same CLI built and passed archive roundtrip,
  signatures and resource verification on attempt 2.
- First branch/release unit attempts: 12 cascading Agent failures beginning
  with `instance-bootstrap`. Isolated bootstrap: 3/3 runs PASS; five affected
  files together: 38 PASS / 1 SKIP. Subsequent CI Agent suite: 3650 PASS,
  24 SKIP, 1 TODO, 0 FAIL. Root cause of the original cascade remains unproven.
- Branch attempt 2: Host `async operation journal retains ownership through
  waits: kill` failed during cleanup. Five isolated runs using pinned
  Node 24.19.0 passed. A possible disconnect/exit cleanup race was identified,
  but not fixed or claimed as proven. Branch attempt 3 passed.
- Release attempt 2: Windows native profile ACL check failed with
  `PROFILE_PERMISSIONS_INVALID` after about 30.28s, matching its PowerShell
  command limit. Exact OS-level cause is not recorded by the error wrapper.
- Release attempt 2: macOS wrote its Desktop manifest at 11:29:40 UTC after
  successful CLI build. No subsequent log progress for about 20 minutes during
  Desktop artifact verification. The run was cancelled at 11:49 UTC to retry
  Windows/macOS. This is a cancellation, not a passing verification.
- Release attempt 3: both Windows and macOS completed successfully, including
  native/profile, static artifact and offline gates. Release aggregation
  verified provenance and hashes before creating the draft.

The retries establish successful checks for this source and these artifacts;
they do not establish that the intermittent failures have been eliminated.

## Local diagnostic limits

A full local Agent run with proxy environment removed produced 3646 PASS,
24 SKIP, 1 TODO, 4 FAIL. None of the 12 original CI failures reproduced.
Local failures were a file-mode expectation under umask 0002 and three
standalone-status cases without pinned Node configured in that run.
The local full suite is therefore not reported as passing.

## Acceptance boundary

This task builds and verifies CI artifacts. Installed GUI/Loginom/provider
acceptance of the exact new binaries is not performed. Existing installation
and user profiles remain unchanged. Linux/Windows are unsigned; macOS own code
is ad-hoc signed, without Developer ID/notarization. Draft publication is a
separate operation; no public release publication is performed by this task.

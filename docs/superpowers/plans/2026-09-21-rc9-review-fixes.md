# RC9 review fixes

Goal: resolve the two confirmed defects from the sync-dock-rc9 review, as requested by the user.

Design: retain navigation effect receipts but distinguish a durably acknowledged,
safe pre-upload pause from uncertain work in the managed runtime lifecycle.
Unknown navigation and upload effects must continue to require recovery.
Automatic placement must search only model coordinates allowed by the existing
node contract (64 through 10000 on both axes), after applying the viewport transform.
No host recovery bypass, dependency changes, or public protocol changes are needed.

Implementation and validation (in this task, without delegation):

- [x] Extend `client/test/artifact-delivery.test.mjs` to assert safe pause/resume
  lifecycle and retained recovery after a lost navigation/upload reply.
- [x] Extend `client/test/node-placement.test.mjs` to execute the browser adapter's
  generated chooser under zoom, translation, and coordinate-boundary fixtures.
  Confirm that regression tests fail before the implementation changes.
- [x] Fix `client/lib/artifact-delivery.mjs` unsettled classification using the
  acknowledged pre-upload flag and current cleanup/inspection outcome.
- [x] Fix `client/lib/node-target-browser.mjs` to skip points outside the contract
  range before returning a free point.
- [x] Run targeted tests with pinned Node 24.19.0 from the runtime client package.
- [x] Update `docs/migration/source-transforms.json` without changing upstream
  source hashes, verify all imported sources, and record results in the runtime
  instructions and migration checkpoint.

All `client/` paths above are relative to `packages/loginom-runtime/`.
Installed application and live Loginom acceptance are outside these source checks.

Results: the two delivery lifecycle assertions and five placement cases failed
before the fix. Afterwards the four targeted suites passed all 146 tests.
Source verification passed for 5045 active files; six migration tests passed.

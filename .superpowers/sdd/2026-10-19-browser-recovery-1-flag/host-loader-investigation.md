# Host test loader investigation

The failure was in the pinned Bun 1.3.14 test runner's module loading after an in-process fixture build, not in the Node Host capability path. All reported `EISDIR` targets were regular files. No production code changed.

Minimal reproduction from `packages/loginom-host` with pinned Bun in `PATH` and pinned `LOGINOM_AI_AGENT_TEST_NODE`:

`bun test test/browser-recovery-capability.test.ts test/saved-package-shutdown.test.ts` before the fix: the two capability tests passed, then `saved-package-shutdown.test.ts` failed before registering tests with `EISDIR reading file: .../effect/dist/index.js` (`2 pass, 1 fail`). Reversing the command's file arguments gave the same result. `bun test test/skills-acceptance.test.ts test/saved-package-shutdown.test.ts` passed `34/34`; filtering out capability test execution made the saved-package cases pass.

To isolate the factor, a temporary test imported `connectionStore`, called `buildNodeHost` (`Bun.build`) and launched/closed the compiled Node Host. Paired with saved-package tests, this reproduced `EISDIR` on `effect/dist/index.js` (`1 pass, 1 fail`). Removing only the `connectionStore` import made the pair pass. Keeping that import and launching the same `build-node-host.ts` in a separate Bun process also made the pair pass (`7 pass, 0 fail` with the saved-package policy cases). The temporary probe was removed. This establishes an in-process Bun build/module-loader interaction; it does not establish which Bun internals mis-handle the file descriptor.

Fix: the capability test now builds its real compiled Node Host in a separate Bun process, using the existing `node-host.test.ts` fixture pattern. Its real Node IPC, validation, hostile environment and opposite tool-argument assertions are unchanged. No retry, cache reset, version change or new mechanism was added.

Checks after the fix: same two-file command `19 pass, 0 fail`; full `bun test` in `packages/loginom-host` `368 pass, 7 skip, 0 fail` across 51 files; `bun typecheck` pass; `git diff --check` pass. The skipped tests are pre-existing platform/resource gates. Origin/demo-022 reproduction was unnecessary after the minimal pair and controlled fixture change identified and resolved the failure.

# IND-10: runtime crash during active import

Linux candidate native executable `0.1.4-cli.202609180130`, explicit development
bundle `/tmp/loginom-cli-native-staging-202609180107/resources/loginom`.
Real Chromium/Loginom, scripted model provider; not installed/archive acceptance.

Driver selects the active chat browser, then its parent within the captured
CLI descendant tree. Before SIGKILL it requires the parent's command to contain
the exact managed-entry.mjs entrypoint. This avoids killing readiness runtime
or unrelated processes. Signal follows running import receipt and durable
recovery. Provider then finishes without sending another Loginom tool request.

Package-local loginom-host typecheck: PASS.

## Live result: PASS

Evidence `/tmp/loginom-cli-owner-crash-yIA8Rn`; log
`/tmp/loginom-cli-runtime-crash-live.log`.

- SIGKILL targeted the active chat runtime after running import receipt.
- CLI code 1, deadlineExceeded false, trackedProcesses 24, alive [].
- stderr LOGINOM_RECOVERY_REQUIRED and LOGINOM_HOST_CLEANUP_FAILED.
- Writer guard retained; subsequent status code 3, PROFILE_BUSY.
- Durable recovery `fac2719b-be21-42f3-815d-f82ae8bb39fc.json` retained.
- No acknowledgement, replay or manual guard removal performed.

The missing clean runtime exit cannot be treated as successful host cleanup.
Code 1/retained guard therefore differs from browser-only crash, where host
can confirm cleanup and return recovery-required/code 4. Exact server phase at
signal time is not atomically known; business outcome remains unknown.

Remaining: complete installed artifact validation, network-loss-after-dispatch,
real model provider, native platform and other original acceptance gates.

# IND-10: Chromium crash during active import

Linux, candidate native executable `0.1.4-cli.202609180130`, explicit development
bundle `/tmp/loginom-cli-native-staging-202609180107/resources/loginom`.
Real Chromium/Loginom; scripted model provider. Not installed/archive acceptance.

## Driver diagnosis

First two attempts (`/tmp/loginom-cli-owner-crash-Gm0pbX`,
`/tmp/loginom-cli-owner-crash-SzGgM5`) stopped at
CRASH_BROWSER_IDENTITY_INVALID before sending the browser signal. They do not
prove browser crash handling. Driver finally requested ordinary CLI SIGINT.

Observed Chromium rewrites its process title: `/proc/PID/cmdline` can contain
all arguments inside argv[0]. Also the host owns a readiness browser in addition
to the active chat browser. Driver now identifies the executable via
`/proc/PID/exe`, excludes child --type processes and the readiness profile,
and requires exactly one browser belonging to this isolated runtime profile.
Identity evidence records executable/PID/selection only, not full arguments.

Package-local loginom-host typecheck: PASS. An accidental root turbo typecheck
also ran (32 tasks successful); it is not the prescribed validation command
and does not substitute for package-local validation.

## Live result: PASS

Evidence `/tmp/loginom-cli-owner-crash-HuJh5a`; log
`/tmp/loginom-cli-browser-crash-confirm.log`. After dock_node_apply returned
running and durable recovery existed, SIGKILL targeted the active chat's main
Chromium process. Scripted provider finished without another tool call.

- code 4; stderr LOGINOM_RECOVERY_REQUIRED; deadlineExceeded false.
- All 24 originally tracked processes ended; alive [].
- Writer guard released after successful host cleanup; guarded false.
- Subsequent status code 0, state recoverable-error, busy false.
- Recovery `330a6161-2591-4cfd-957e-616e4628a907.json` retained.
- No explicit recovery acknowledgement or replay was sent.

Exact server phase at signal delivery is not atomic with the running receipt;
external business outcome remains unknown. This proves the bounded active-work
browser-loss case for this candidate, not all possible crash timing or native
platforms. Real model provider, installed packaging, runtime crash and network
loss acceptance remain open.

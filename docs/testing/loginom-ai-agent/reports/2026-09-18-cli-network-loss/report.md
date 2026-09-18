# IND-10: isolated network loss

Added a manual HTTP TCP relay for the test profile only. It forwards real bytes
and can destroy established connections and reject subsequent connections.
No global proxy/routing changes; upstream is restricted to the configured
Loginom address. No secrets or traffic bodies are logged.

Local real-socket regression PASS: 1 test, 4 assertions. An established echo
response succeeds before disconnect, connection closes after disconnect,
reconnect is rejected, direct upstream still responds. Host typecheck PASS.

Live candidate: full artifact 0.1.4-cli.202609180135 in /dev/shm, no development
bundle override. Real Loginom/Chromium and scripted model provider. Runtime
profile uses the local relay address, so this is explicit fault-injection
acceptance, not ordinary direct-origin execution or installed launcher acceptance.

## Live setup limitation (not a network-loss PASS)

Attempts `/tmp/loginom-cli-owner-crash-Kbe0k2` and
`/tmp/loginom-cli-owner-crash-GlgmG0` failed before dispatch at setup.
Second diagnostic: LOGINOM_LOGIN_UNAVAILABLE. No network fault was triggered.
The driver now captures setup diagnostics with API-key exclusion and closes
its relay on setup failure.

A separate real HTTP read through the relay returned 200 text/html with no
redirect (accepted=1, rejected=0). Thus TCP/HTTP forwarding is reachable, but
browser login through the substituted local origin remains unverified. Do not
infer a product network-recovery failure from this setup failure. The remaining
work is to diagnose browser login/origin constraints or use a fault mechanism
that preserves the original origin; network-loss gate remains open.

## Browser isolation diagnosis

A separate real Chromium login-only probe authenticated successfully against
original configured origin. Through relay it received login-page HTML and
rendered the Loginom 7.4.2 login screen, with no requestfailed or HTTP >=400
signals, but timed out on expected automation flow. Relay accepted 14–15 TCP
connections. This isolates the setup issue to the substituted origin/relay
path; original-origin authentication still works. No import/network fault
was performed by these probes. Temporary harnesses are outside the repository.

Further probe localized failure before username input: page retains testable=true
and correct LoginForm test IDs, but WebSocket to the relay's host/port opens and
closes before fill can complete. No intentional disconnect was triggered.
The prior hypothesis of missing automation selectors is contradicted by observed
DOM. Next investigate WebSocket Host/Origin handling or preserve original origin
in an isolated forwarding mechanism. This is diagnostic evidence, not a claim
that the server definitively validates Origin; that cause remains unproven.

Header hypothesis check: a temporary forwarding probe rewrote initial HTTP Host
and Origin to the original configured address. Browser still closed WebSocket
before username input with the same timeout. This change was not applied to
project sources; rewriting these headers alone did not resolve the failure.

WebSocket close event is code 1000, empty reason, wasClean=true. A subsequent
probe observed no pageerror/console error. Therefore early WebSocket closure
alone is not evidence of a transport failure or Origin rejection. Browser
interaction actionability is the next diagnostic boundary; network-loss gate
remains untested. All probes use temporary isolated profiles and close Chromium.

## Root cause and fix

Actionability diagnostics found the actual timeout in filling the **password**
field with an empty string: input readonly=true. The earlier stage label
"username" covered both fills and was misleading. Loginom can make an empty
password field readonly after passwordless-account lookup. The direct probe
happened to fill before that transition; relay timing exposed the race.

Runtime loginPage now skips filling when both the supplied password and observed
field value are empty. Nonempty supplied passwords are still filled; stale
nonempty field contents are still cleared for an empty supplied password.
No readonly override, forced DOM write or authentication bypass was added.

Pinned Node unit tests: 4 PASS (URL handling, empty readonly, stale value clearing,
nonempty password, account identity assertions). Actual Chromium/loginPage source
probe through the unmodified TCP relay: authenticated=true, accepted=16,
rejected=0. This disproves Host/Origin rewriting as the required fix for this
case. Full artifacts predating this edit still contain the old loginPage;
network-loss dispatch acceptance requires rebuilding/staging the fix first.

## Full build containing passwordless fix

Version 0.1.4-cli.202609180210, source snapshot
8a6271627e9a3acb5a13fd70323cdaed130cb828e6f9c8256d27b6c30377b8fa,
commit c37913ab5ca8f421b76286bf25c282b83cc2de56, dirty development candidate.
Build/version/source-stability/manifest/extracted-archive checks PASS.
Artifact /dev/shm/loginom-cli-passwordless-202609180210 (ephemeral).
Archive copied to /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180210-linux-x64.tar.gz;
SHA256 independently verified:
469e9dbbae2b844e9bb7ea694ec2aeb00098c41266b4aa4ab3533a877d0fc6e3.
Build log /tmp/loginom-cli-passwordless-202609180210-build.log.

After build, manual driver instrumentation was extended to count severed sockets
and reject a fault that affected no active connection. This instrumentation is
outside the product bundle. Socket regression now 5 assertions PASS; host
package typecheck PASS.

## Live attempt 02:10: stopped before network fault

Evidence /tmp/loginom-cli-owner-crash-Ig2Q7p; log
/tmp/loginom-cli-network-loss-0210.log. Passwordless setup succeeded and real
Loginom preparation completed. Artifact delivery returned AMBIGUOUS,
effect_possible=true, upload_submitted_or_unknown=true,
ARTIFACT_DELIVERY_INCOMPLETE: destination bytes require inspection.
Driver stopped at CRASH_DELIVERY_FAILED before import or network.disconnect.
No automatic retry/acknowledgement was issued. This is not a network-loss PASS;
uncertain upload outcome is preserved for inspection rather than erased.
Next determine the delivery verification failure on the isolated relay path.

Delivery evidence was narrowed to DOWNLOAD_EVENT_MISSING: the destination file
was discovered, download gesture SUCCEEDED, but no browser download event arrived.
The original upload is still uncertain and was not retried. A new isolated test
uses a new profile/attachment destination.

Hypothesis under test: loopback URL changes Chromium secure-context/download
policy. Manual relay now optionally binds an IPv4 address assigned to this
machine, rejects any inbound client whose source address differs from that local
address, and refuses non-local bind addresses. Default remains 127.0.0.1.
This does not change product browser security settings or global routing.

## Live network loss: PASS for bounded scenario

Full artifact 0.1.4-cli.202609180210, no bundle override. Evidence
/tmp/loginom-cli-owner-crash-nxto7k; log /tmp/loginom-cli-network-loss-local-ip.log.
A new profile with relay on a local non-loopback IPv4 completed passwordless
setup, original-user CSV delivery including bytes verification, then received a
running import receipt and persisted recovery before fault injection.

Relay: disconnected=true, severedSockets=4, rejected reconnects=4,
accepted connections=2624 over the run. CLI code 4/LOGINOM_RECOVERY_REQUIRED,
deadlineExceeded=false; all 24 tracked processes ended. Guard released after
cleanup; subsequent status code 0, recoverable-error, not busy. Recovery
ff9ede21-50c5-4521-9504-827c7b41f249.json retained. No acknowledgement or
explicit tool replay was sent. Browser reconnect attempts are distinct from
replaying an admitted business operation.

This proves the tested post-running-receipt connection-loss case with real
Loginom/Chromium and scripted provider. Exact server operation phase is not
atomic with receipt/fault timing, so business outcome remains unknown. It does
not prove all network failure timings, installed-launcher execution of this
version, real model provider or native Windows/macOS gates.

Changing relay address resolved delivery for this run. This is evidence
consistent with loopback download-policy differences, not independent proof
of the exact Chromium policy responsible. The earlier ambiguous upload remains
preserved and was not acknowledged/retried.

Final host checks: 2 socket tests PASS, 6 assertions; package typecheck PASS.

## Installed version 02:10 acceptance

Removed only the task-owned intermediate resource staging directory
/tmp/loginom-native-staging-ACeyRl/resources (568 MB), after verifying its
resource-only layout. This was not a profile or release archive. Historical
staging verification remains historical; that intermediate path is now absent.

Actual install.sh for 0.1.4-cli.202609180210 succeeded. Live network-loss run is
started via ~/.local/bin/loginom-ai-agent-cli, with no bundle override and
restricted PATH=/tmp/loginom-cli-path-1930. Scripted provider remains in use.

Installed network-loss result: PASS, evidence /tmp/loginom-cli-owner-crash-nSrSSV;
log /tmp/loginom-cli-installed-network-loss-0210.log. Actual user launcher,
restricted PATH, no bundle override. After active import receipt, severedSockets=4,
rejected reconnects=4, code=4, deadlineExceeded=false, trackedProcesses=24,
alive=[], guarded=false, retryCode=0, retryState=recoverable-error.
Recovery 197a3e58-83a4-4284-aaca-810e11db9d34.json retained.

Actual uninstall.sh exit 0. Launcher/versioned payload absent; all 4113 profile
file hashes match before/after uninstall. No recovery acknowledgement or replay.
Archive remains on persistent disk; artifact directory in tmpfs is ephemeral.
This result upgrades this bounded scenario to installed acceptance; it still
uses a scripted provider and does not close native OS/real model/Desktop gates.

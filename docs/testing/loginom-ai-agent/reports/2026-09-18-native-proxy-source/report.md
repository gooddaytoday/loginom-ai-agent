# Native CLI manual proxy adapters — source checkpoint

Windows CLI collector calls WinHttpGetIEProxyConfigForCurrentUser through a fixed
PowerShell/PInvoke script, frees returned native allocations, emits bounded JSON,
and uses the absolute OS PowerShell executable. It does not read another user's
registry or forward provider secrets in the child environment. macOS collector
uses /usr/sbin/scutil --proxy. Both collectors are read-only, bounded and discard
native stderr; failures expose stable SYSTEM_PROXY_* codes.

Primary API references:
- [Microsoft WinHttpGetIEProxyConfigForCurrentUser](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/nf-winhttp-winhttpgetieproxyconfigforcurrentuser)
- [Microsoft current-user configuration structure](https://learn.microsoft.com/en-us/windows/win32/api/winhttp/ns-winhttp-winhttp_current_user_ie_proxy_config)
- [Apple scutil manual source](https://github.com/apple-oss-distributions/configd/blob/main/scutil.tproj/scutil.8)

loadCliProxyEnvironment is called before CLI provider/host imports. Shared Linux
GNOME precedence remains unchanged. Desktop keeps its existing loader; native
CLI source work does not silently replace Desktop platform integration.

Supported parser subset: manual HTTP/HTTPS forward proxies, IPv6 endpoints,
Windows shared or per-scheme routes, default HTTP port, explicit hostname/domain
bypass and loopback. Stale HTTP/HTTPS/ALL_PROXY values are cleared/overridden for
manual system policy. No configured proxy preserves shell environment.

Explicitly unsupported: PAC/WPAD/auto-detect, SOCKS/FTP, authenticated proxy,
macOS scoped/supplemental routes, CIDR, arbitrary wildcards and <local>/simple-host
bypass. These fail closed instead of approximating routing. This includes common
automatic Windows defaults and macOS exception lists: native usability is NOT
claimed for those settings. Native OS validation is still required before release.
No OS settings are changed automatically.

CLI handles these known configuration errors before host startup: exit 2 and a
stable diagnostic, releasing the profile guard. An actual repeated CLI process
fixture verifies this early exit and that no stale busy guard remains.

Validation on Linux only:
- native-proxy parser/foreign-platform tests: 5 PASS, 34 assertions;
- CLI unsupported-proxy entry regression: 1 PASS, 8 assertions;
- full standalone-status integration suite: 3 PASS, 89 assertions;
- existing Desktop/Linux proxy tests: 5 PASS, 19 assertions;
- host, agent and Desktop package typechecks: PASS.

Not performed: PowerShell PInvoke execution, real scutil output/format coverage,
native provider/Dock networking, proxy authentication, native CA, new compiled
CLI artifact acceptance. Unit fixtures are not native OS evidence. Next native
checks must exercise supported manual/no-proxy settings plus explicit rejection
of automatic/scoped policies, loopback bypass, provider startup and secret-free
errors. Earlier 02:10 artifacts do not contain these new source changes.

## Linux full artifact 02:40

Version 0.1.4-cli.202609180240; source snapshot
b3c16f360e5f91df22aead334434852e35ed729fe5db2763522827165ef283c0,
base commit c37913ab5ca8f421b76286bf25c282b83cc2de56, dirty development build.
Native version smoke, source stability, manifest and extracted archive verification
PASS. Artifact /dev/shm/loginom-cli-proxy-202609180240 (ephemeral).
Archive persisted at /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180240-linux-x64.tar.gz,
SHA256 8bb96171d31ffbe92434595cd03046992afdb9a9bbfe8f81cafada2d3ad7f45d, verified again
after copying. Log /tmp/loginom-cli-proxy-202609180240-build.log.

To free disk space, the old 01:07 extracted candidate directory was removed
only after its retained archive hash was verified and no processes referenced
its executable paths. The archive remains intact. An initial metadata assertion
used the wrong manifest key and stopped deletion; corrected metadata.version
validation succeeded before cleanup. Historical paths denote historical tests.

Actual install.sh and installed-launcher acceptance PASS with restricted PATH,
no bundle override, private new profile. Help/version do not create the profile;
real passwordless Loginom setup/check succeeds. A temporary gsettings fixture
reports unsupported authentication policy: two invocations return exit 2 and
SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED without retaining the guard. A subsequent
normal status invocation succeeds. This tests the compiled early-error path on
Linux, not Windows/macOS collector execution.

Actual uninstall.sh exit 0; launcher absent; all 3676 profile file hashes unchanged.
Evidence /tmp/loginom-cli-0240-1moxqqcv; log /tmp/loginom-cli-0240-acceptance.log.
No model-provider inference was invoked. Native collectors, provider networking
and platform/signing requirements remain unverified.

## Installed Windows candidate smoke

`loginom-windows.yml` installs and launches its own NSIS candidate on the same
Windows runner after package verification. The shared entry point also runs on
a clean Windows test account (PowerShell 7 and Node 24):

```powershell
./packages/desktop/test/loginom/windows-installed-smoke.ps1 `
  -Installer C:\candidates\loginom-ai-agent-win-x64.exe `
  -EvidenceDirectory C:\evidence\candidate-001 `
  -Version 0.3.9 -Channel dev -NodePath C:\node\node.exe
```

Use the actual candidate version and a new evidence directory for every run.
The script refuses to replace an existing installation of the same channel.
It installs into a unique temporary directory, starts the installed executable
through its bundled Playwright library, checks the onboarding window and saves
a screenshot. No Loginom or model credentials are needed.

The smoke verifies the exact installed version, `app starting` and actual
`server ready` events, graceful exit, no surviving installed processes, the
bundled `resources/loginom/help/help-manifest.json`, and the absence of
`mcp.loginom.ai` in all installed files (binary ASCII and UTF-16 included).
It silently uninstalls and checks that a unique sentinel file in the channel's
normal `%APPDATA%` profile survived byte for byte, then removes its own sentinel.
Existing profile files are never removed by the test harness.

`LOGINOM_AI_AGENT_TEST_ONBOARDING=1` and an absolute
`LOGINOM_AI_AGENT_TEST_ROOT` isolate the app. Consequently its journals are
`<TEST_ROOT>\desktop\logs\<run>\main.log`, rather than the normal
`%APPDATA%\<channel ID>\logs\<run>\main.log`. A healthy app always creates
`crash.log` with `crash reporter started`; that info event is allowed. Other
crash events, minidumps, main-log errors and an unclean exit fail the smoke.

The workflow always uploads `loginom-windows-installed-smoke-<run ID>` with
`windows-installed-smoke.json`, copied journals, probe stdout/stderr and the
window screenshot when available. Failed temporary profiles remain on the test
machine for diagnosis; successful temporary installs/profiles are removed.
The evidence artifact does not contain the profile or installed payload.

This is an installed startup/cleanup check. It does not establish live Loginom
or model connectivity, business-scenario acceptance, signing/SmartScreen trust,
or persistent history across upgrades (the onboarding test uses an in-memory DB).
`release.yml` is outside this check's scope.

Regression checks from the repository root:

```sh
node --test packages/desktop/test/loginom/windows-installed-smoke.test.mjs
```

The installer uses the documented [NSIS silent switches](https://nsis.sourceforge.io/Docs/Chapter3.html)
(`/S`, unquoted `/D` last); uninstall uses `_?=` to wait for the original
uninstaller. Desktop shutdown uses [Playwright's Electron close API](https://playwright.dev/docs/api/class-electronapplication#electron-application-close).

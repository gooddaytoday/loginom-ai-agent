# Windows runtime CI coverage

`test.yml` runs the `windows-runtime` client/runtime/host matrix on
`windows-2022` for pull requests, release
branches and reusable release gates. `setup-loginom-inputs` reads the product
pins (Node 24.19.0, Chromium 1246), checks the downloaded Node version and browser
directory, and installs locked client dependencies even on a cache hit. Tests
receive the pinned Node and an existing Chromium executable explicitly.

The following paths are relative to `packages/loginom-runtime/client/test/`.
The job runs each complete file, including its existing platform conditions.

| Platform boundary | Client test files |
|---|---|
| Windows ACLs without PATH | `platform-windows.test.mjs` |
| Artifact files, MAX_PATH, Unicode basenames, permissions, symlinks, hashes and cleanup | `artifacts.test.mjs`, `artifact-download.test.mjs`, `artifact-upload.test.mjs`, `artifact-verification.test.mjs`, `file-reference.test.mjs` |
| Local attachments and paths containing Cyrillic and spaces | `host-inputs.test.mjs`, `host-artifacts.test.mjs`, `storage-download.test.mjs`, `storage-source.test.mjs` |
| Private configuration, durable files, links, redaction and permissions | `config.test.mjs`, `history.test.mjs`, `archive.test.mjs`, `execution-journal.test.mjs`, `local-diagnostics.test.mjs`, `runtime-pin.test.mjs`, `skill.test.mjs` |
| Command launchers, install pointers and runtime discovery | `agent-command.test.mjs`, `install.test.mjs`, `install-profile.test.mjs`, `hook-runtime.test.mjs`, `hooks.test.mjs`, `landing.test.mjs` |
| Browser launch, temporary paths, environment, diagnostics and download scripts | `browser-launch.test.mjs`, `browser-temp.test.mjs`, `browser-downloads.test.mjs`, `bridge.test.mjs`, `connection-check-windows.test.mjs` |
| Child processes, clipboard socket ownership, cancellation and shutdown | `clipboard.test.mjs`, `clipboard-shutdown.test.mjs`, `managed-shutdown.test.mjs`, `managed-signal-order.test.mjs` |
| Text encodings, UTF-8 and Windows-1251 | `text-import-encoding.test.mjs`, `text-export.test.mjs`, `text-export-cp1251.test.mjs` |

The separate `chromium-direct (windows-2022)` job continues to run native
system-proxy and browser-download acceptance, including headed Chromium:
`windows-crypto-probe.test.mjs`, `browser-proxy.integration.test.mjs` and
`browser-downloads.integration.test.mjs`. It isolates Mozilla background tasks
before changing the disposable runner's proxy settings.

`windows-runtime` also runs **every** `packages/loginom-runtime/test/*.test.mjs`:

- `call-timeout.test.mjs`, `start-input.test.mjs`: private startup and call validation.
- `connection-check.test.mjs`, `connection-cancellation.test.mjs`,
  `connection-login-diagnostics.test.mjs`, `managed-login-diagnostics.test.mjs`:
  URL handling, actual browser cancellation and safe native diagnostics.
- `knowledge-entry.test.mjs`, `managed-entry-close.test.mjs`,
  `managed-resources-close.test.mjs`: IPC children, owner loss, shutdown and cleanup.
- `resources.test.mjs`, `resource-inventory.test.mjs`: executable resources,
  Unicode paths, integrity, internal symlinks and escape rejection.

Host paths below are relative to `packages/loginom-host/test/`. They run with
Bun 1.3.14; subprocess tests receive the same pinned Node and Chromium inputs.

| Platform boundary | Host test files |
|---|---|
| Process IPC, Unicode paths, environment allowlists, lifecycle and owner loss | `process.test.ts`, `environment.test.ts`, `node-host.test.ts`, `runtime-startup.test.ts`, `transport.test.ts`, `host.test.ts`, `parallel-calls.test.ts`, `saved-package-shutdown.test.ts`, `cli-owner-crash.test.ts` |
| Windows PowerShell module isolation and native DPAPI | `windows-powershell.test.ts`, `cli-credentials.test.ts`, `keychain-platform.test.ts`, `keychain-envelope.test.ts` |
| Native Windows install, junction rejection, launchers and resource manifests | `cli-install-windows.test.ts`, `cli-install.test.ts`, `cli-manifest.test.ts`, `cli-source-snapshot.test.ts`, `stage-resources.test.ts`, `bundled-ripgrep.test.ts` |
| OS proxy readers, Windows registry data, PAC files and network probes | `system-proxy.test.ts`, `system-proxy-behavior.test.ts`, `system-proxy-io.test.ts` |
| Local file admission, metadata, links, permissions and IPC transfer | `inputs.test.ts`, `file-reference.test.ts`, `file-reference-ipc.test.ts` |

Existing POSIX-only cases retain their platform conditions. In particular,
Linux-only Docker/X11 skills acceptance and macOS Keychain acceptance are not
Windows coverage. This source-test gate complements installed
`release-windows-desktop` acceptance.

The managed-shutdown fixture delivers SIGINT/SIGTERM handler events through
private test IPC on Windows, where `child.kill()` forcibly terminates a process.
POSIX keeps real signals; EOF, process exit and kernel clipboard ownership are
real on both platforms. This does not certify native console Ctrl+C delivery.

The existing `windows-native-check.yml` also executes `process`, `environment`,
`windows-powershell`, `cli-credentials`, `cli-install-windows` and `cli-manifest`
on Windows 2022 and 2025 when host paths change (or on manual dispatch).
`windows-runtime` makes this host subset, and the additional suites above,
part of every `test.yml` run and its reusable release gate, independent of those
path filters.

Each suite has an independent job and a log in its `windows-client-*`,
`windows-runtime-*` or `windows-host-*` artifact (14-day retention).
`fail-fast: false` keeps a client failure from cancelling runtime or host;
no failure is ignored. Only host jobs install the Bun workspace dependencies.
Host files run in separate Bun processes and the job fails if any process fails,
so a native Bun crash cannot hide the remaining files.
Node suites use TAP so assertion details are written immediately, including
when a later test retains an open handle. Each suite has its own step timeout
within the job's 20-minute limit.

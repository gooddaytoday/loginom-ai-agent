# Desktop update acceptance

## Windows fixtures

Dispatch `loginom-windows.yml` with `updater-fixtures=true` and `updater-public-key` containing an Ed25519 public PEM. CI builds isolated Desktop installers 0.4.0 and 0.4.1 and a matching Linux 0.4.1 AppImage for the mirror input contract. These artifacts are test fixtures; do not publish them as product releases. The signing private key stays with the test operator. The Windows fixture contains only the existing read-only S3 key, never a writer, and its built-in feed is restricted to `dryrun-040/`.

Only `LOGINOM_AI_AGENT_UPDATE_TEST_BUILD=1` at build time enables the fixture trust root. The release workflow ignores this opt-in. Ordinary builds ignore the test-key input and packaged applications cannot replace their trust roots through environment variables or command-line arguments. Run fixtures with `LOGINOM_AI_AGENT_TEST_ONBOARDING=1` and an explicit absolute `LOGINOM_AI_AGENT_TEST_ROOT`. Only these compiled fixtures persist the isolated backend database at `<root>/data/loginom-ai-agent.db`; ordinary onboarding tests retain their in-memory database. The fixture refuses to start without an isolated test profile.

Use the administrator policy `feedUrl` to route a fixture to a private HTTPS test server; preserve and restore any existing policy. Removing that override returns the Windows fixture to authenticated reads of `https://updates-loginom.s3.cloud.ru/dryrun-040/`. Test certificates must be trusted normally; do not disable certificate verification. Preserve exact installer hashes, source SHA, download/install logs and the same profile across restarts. Admit a chat through the public backend APIs without executing a model request. Verify settings, that chat and native credential readback after the update.

When upgrading an isolated **normal** 0.3.9 profile to a fixture, preserve its Chromium `Local State` as well as the connection files. Normal Electron shares `userData` and `sessionData`, whereas onboarding tests normally split `<root>/desktop` and `<root>/session`. Point both fixture paths at the original isolated profile before its first launch; starting with a new session profile creates a different encryption key and cannot establish DPAPI preservation. Keep a closed old-profile snapshot for each acceptance trial.

## Linux AppImage

Run after building the desktop and Linux packages, from `packages/desktop`, with the pinned Bun in PATH:

```sh
export LOGINOM_AI_AGENT_UPDATE_TEST_ROOT=$(mktemp -d /tmp/loginom-update-test-XXXXXX)
bun test/loginom/updater/feed.ts > "$LOGINOM_AI_AGENT_UPDATE_TEST_ROOT/feed.log" 2>&1 &
loginom_feed_pid=$!
resources/loginom/bin/node test/loginom/updater/build.mjs
xvfb-run -a resources/loginom/bin/node test/loginom/updater/acceptance.mjs
kill "$loginom_feed_pid"
```

Start the builder after `feed.json` appears. The test requires Linux, Xvfb, a current `dist/linux-unpacked`, matching `out`, and workspace build dependencies. It uses no Loginom credentials and makes no model request: its chat message is durably admitted with `noReply: true`.

The builder copies the application into an isolated directory and creates fixtures 0.1.0 and 0.1.1. It changes the fixture's feed to a loopback HTTP server, package version, and ASAR packing; the production artifacts and default disabled feed remain untouched. The fixture includes the updater metadata that the builder emits when an own feed is configured. These are test fixtures, not distributable releases.

Acceptance rejects an upstream asset URL, a beta candidate on the stable channel, and a payload with an incorrect SHA512. It then exercises the real application updater, replaces the installed AppImage, observes the old main process exit and the updated application relaunch, and reopens the same profile to verify version 0.1.1, a setting and the original chat message.

AppImage extraction wrappers do not reliably emit the Playwright application close event during automatic relaunch. The test checks the real main PID. To reattach its inspector, it terminates only the updated fixture process identified by its private profile's SingletonLock and its descendants, then launches it again. Electron may clear `/proc/environ`, so environment matching is not used for cleanup. No ordinary desktop profile is touched.

A successful exit and `report.json` together are the acceptance result. Reports are written after cleanup. Local unsigned Linux hashes are tested; Windows/macOS signing and native update behavior remain separate acceptance tasks.

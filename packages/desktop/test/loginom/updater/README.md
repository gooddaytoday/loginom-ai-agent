# Linux AppImage update acceptance

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

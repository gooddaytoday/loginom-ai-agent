# Linux continuation: clean CLI and real provider

Scope: finish the Linux work feasible on this machine. Windows/macOS acceptance
is explicitly deferred by the user and is not a blocker for this scope.
User authorized using the Desktop Xiaomi token for an isolated CLI acceptance
profile. The token exists for xiaomi-token-plan-sgp; no credential value is
included in this report or committed fixtures.

## Clean artifact

- Source: `1657a6c07e929fccc21a9c97c0d0ef05ae72a584`, sourceDirty=false.
- Source tree SHA256: `5dc814f3c3787d409f03c550d58a7121afeec5f8d2b62e4200110c4fb09e3581`.
- Version: `0.1.4-cli.20260918review`, dev, linux-x64.
- Artifact: `/tmp/loginom-linux-1657a6c07`.
- Archive: `/tmp/loginom-ai-agent-cli-0.1.4-cli.20260918review-linux-x64.tar.gz`.
- Archive SHA256: `df1ada937ef8f5dd692ffc8e3a7950b063ba96c2aadbfe4a152482091c31eb43`.
- Pinned Bun 1.3.14, Node 24.19.0, Playwright 1.63.0-alpha-2026-08-31,
  Playwright MCP 0.0.80, Chromium revision 1243.
- Build, native version smoke, source stability, payload manifest, extracted
  archive verification: PASS. Build log: `/tmp/loginom-linux-1657a6c07-build.log`.

This is an unsigned development candidate with known license/source-distribution
review gaps. A clean source tree does not imply release approval.
Real-provider and installed acceptance results follow as they complete.

## Installed real-provider smoke — PASS under user-revised criterion

Installed with the archive's own install.sh; launcher
`/home/kiselev/.local/bin/loginom-ai-agent-cli --version` returned the exact version.
Desktop installation and its auth file were not modified. Only the authorized
Xiaomi entry was copied into a private CLI profile, with credentials file mode 0600.

Real model: `xiaomi-token-plan-sgp/mimo-v2.5-pro`. Headless installed run, no
bundle override; permission allows Loginom tools and denies other tools. The model
successfully called dock_prepare, delivered the original 16-byte sales.csv with
SHA256 `9a9e878ada65f540a453c9625ec70755a11c7e8ca44300968d7646b7c2d6f463`,
and configured a numeric import through node.apply / node.wait. This proves real
LLM → backend → private host → Chromium → Loginom operation and continuation.

The broader prompt did not complete: two parameter validation failures were
followed by an ambiguous graph connection, preserved as recovery. Exit was 4,
`.writer` was released. No success/cold-reopen/55 result is claimed for this run.
Private evidence: `/tmp/loginom-real-1657a6c07`; sanitized counters: summary.json.
No browser/runtime processes matching these test profiles remained after cleanup.

The user then explicitly accepted successful real model tool activity as sufficient
and asked to move on. Therefore the real-provider gate is PASS to that revised
criterion; earlier scripted-provider CSV 55/101 evidence remains separate.
The independent second attempt `/tmp/loginom-real-1657a6c07-a2` was cancelled via
SIGINT on that instruction: exit 130, writer released. Its unfinished work is not
counted as a completed oracle. No uncertain operation from the first run was replayed.

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

# Final Linux development archive — 2026-09-18

## Artifact provenance

- Version `0.1.4-cli.20260918linux`, dev, linux-x64.
- Clean source `edc68138df741f6e3c687dd5c05987eca06b74e0`.
- Source tree SHA256 `d12d5213e6c750505c138b1d5d039621e6595ef64cfaf2ea32c38dcb9c527037`.
- Payload `/tmp/loginom-linux-edc68138d`.
- Archive `/tmp/loginom-ai-agent-cli-0.1.4-cli.20260918linux-linux-x64.tar.gz`.
- Archive SHA256 `c3713e86ef8081cabec188a3138f356cc9b8f31ca7d3a3e7e54506d52aa98838`.
- Build log `/tmp/loginom-linux-edc68138d-build.log`.

Build/native version/source stability/full manifest/extracted archive: PASS.
This archive includes the review fixes and the three declared-license supplements.
It is unsigned, development-only; attribution/nested/native/source/relinking review
is not represented as complete legal clearance.

## Installed lifecycle: PASS

Used the archive's own install/uninstall scripts. Installed launcher was
`/home/kiselev/.local/bin/loginom-ai-agent-cli`, payload version directory
`/home/kiselev/.local/share/loginom-ai-agent-cli/0.1.4-cli.20260918linux-dev`.
Help/version ran with PATH=/usr/bin:/bin without creating the selected profile.
`loginom status --format json` started the bundled private host, returned an
unconfigured view and released `.writer`.

Independently verified all 932 installed npm notice/README hashes; missing-text
list empty, inventory status correctly remains incomplete. Uninstall removed
launcher and payload. All 8093 regular files across the new fixture profile and
the two real-provider test profiles remained byte-identical. Desktop provider
auth and Loginom connection files were byte-identical before/after this check.
No credentials or credential hashes are included here. See install-summary.json.

## Offline Linux compatibility: PASS within the stated scope

Local images `loginom-agent-linux:ubuntu22` and `loginom-agent-linux:debian12`:
non-root UID 1000, network=none, read-only root/payload, tmpfs /tmp,
cap-drop=ALL, no-new-privileges. Both verified:

- Native CLI version and help, no selected profile creation.
- Bundled Node v24.19.0 and successful node:sqlite load.
- Bundled Chromium version 153.0.8010.12.
- Chromium ldd had no missing libraries.

No downloads were possible. These checks cover startup and Linux library
compatibility, not actual Chromium launch, GPU, user namespaces, portals, GUI,
or real model/Loginom access inside containers. Host runtime/model evidence is
recorded separately in ../2026-09-18-cli-real-provider/report.md.

## Additional Linux audit

- Native providers list under strace -f -e trace=%file: 412 file-system trace
  lines, no references beneath Desktop's config/auth/history roots; exit 0,
  selected CLI writer released. Trace contains paths only, not read/write buffers;
  private evidence `/tmp/loginom-cli-access-audit`. This proves this command's
  access behavior, not a complete TUI/run filesystem audit.
- Common permission service, profile guard/alias and standalone proxy suites:
  86 passed, 157 assertions. Always is explicitly workspace/process-scoped:
  the existing test verifies a subsequent session can use a matching approval;
  unrelated pending sessions are not automatically resolved. This is shared with
  Desktop, not a CLI-only hidden auto-approval.
- Actual bundled Node passed local HTTP proxy, HTTPS CONNECT with explicit extra
  CA, node:http proxy routing, loopback bypass, and no-direct-fallback checks.
  The driver was bundled before Node execution because direct stripped-TypeScript
  execution could not resolve extensionless imports. A first Bun CLI build syntax
  failed; Bun.build API produced the driver and the real-network assertions passed.

## Exact project source archive

Created with git archive from the binary's exact clean source commit, not HEAD:
`/tmp/loginom-ai-agent-cli-0.1.4-cli.20260918linux-source.tar.gz` (152 MiB).
SHA256 `db998aeadf374476ae582df6b8129ba1f3be4d6fc7c51d913cabef9ce4331b59`.
This supplies the tracked project sources and build/lock files. It is not a claim
that all third-party corresponding-source/relinking obligations are satisfied.

## Final native headless run oracle: PASS

The packaged final CLI completed both canonical datasets with the scripted
provider and actual Loginom/browser runtime. A: Alpha=35, Beta=20, total=55;
B: Alpha=100, Beta=1, total=101. Each package was saved, closed and independently
cold-opened by the bundled Node/browser readback driver. Both readbacks matched,
settingsReapplied=false. Same-name sales.csv inputs had different hashes, remote
source paths and saved package paths. Driver exit 0.

Evidence `/tmp/loginom-linux-oracle-pBMt7x`; log `/tmp/loginom-final-csv-oracle.log`;
cleaned summary run-oracle-summary.json. This run used the packaged executable
path, not the installed launcher; installed real-provider smoke is separate.
The source archive was also checked against git ls-tree at the binary commit:
11903 entries, zero missing/extra files.

## Final installed headed TUI oracle

The fresh run `/tmp/loginom-linux-oracle-uwsU99` passed both datasets: A=55,
B=101, save/close and independent cold readback with settingsReapplied=false.
The same-named CSV inputs retain distinct source/package paths and original
hashes. Both CLI children exited 0, guard=false; PTY exit was not forced. Each
profile had one visible Chromium window; both window observers reported remaining=[].
Driver exit 0. Summary: [tui-oracle-summary.json](tui-oracle-summary.json).
The earlier failed B close is retained in [diagnosis](tui-driver-diagnosis.md).
This is scripted-provider acceptance of the installed final Linux CLI, separate
from the user-accepted real Xiaomi smoke.

## Current Desktop and process independence

Desktop dev `0.1.4-cli.20260918linux` was built at 3795eeb48 into
`/tmp/loginom-final-desktop-3795eeb48/linux-unpacked`. Product inputs are identical
to CLI edc68138d: the intervening tracked changes only concern docs/test drivers.
The Git commits and full source snapshots differ; no claim of identical full-tree
hashes is made. Build/package logs: `/tmp/loginom-final-desktop-build.log` and
`/tmp/loginom-final-desktop-package.log`. This unpacked candidate was not installed
as DEB and did not replace the user's Desktop.

ASAR SHA256: `98db012b65d2fd08b6a0d7a75ef3c21a9ac2cf28d2edbd47234eaf34ab0b92d1`.
Resource manifest SHA256: `62eb0dc0aefb6770a09be029991f6c5a0b8ffa1b68f4f42ab2966c141e31fcf3`.
All 4365 resource files/ELF checks PASS. CLI/Desktop manifests have identical pins;
the only differing file is flavor-specific THIRD_PARTY_NOTICES.md.

Desktop oracle `/tmp/loginom-linux-oracle-ZPgMbB` passed A=55/B=101, save/close
and independent cold readback without reapplying settings, driver exit 0.
[Summary](desktop-oracle-summary.json). Six actual Desktop/TUI/run model captures
agree on all 34 tools and bootstrap instructions; six prepare replies also agree
on full instructions and knowledge. [Contract hashes](contracts-summary.json).

`script/desktop-cli-independence.ts` exercised both close orders with separate
private profiles and live Loginom workspaces: closing Desktop left CLI able to
observe an authenticated workspace; closing CLI left Desktop able to do so.
All four children exited 0, CLI guards released. Host package typecheck PASS.
This checks process independence, not a fault during an uncertain mutation.
Private evidence: `/tmp/loginom-desktop-cli-independence-gPsrOu`.
[Results](independence-summary.json).

CLI setup/run/prepare/observe/close were traced with strace file syscalls only:
1389 trace files, 959201 syscall lines, zero references to the four checked
Desktop global config/auth/history roots. This extends the earlier providers-list
audit but does not claim exhaustive coverage of every TUI or provider command.
Raw traces and private profiles are outside git.

After all runs no process executable remained under either candidate payload.
The CLI test installation was removed with its own uninstall script; 35205
files in the three evidence/profile roots were preserved byte-for-byte.
[Cleanup](post-oracle-cleanup.json). Archives and unpacked test artifacts remain
in /tmp; the user's Desktop installation was not modified.

## Two chats in one native TUI and file access audit

Final acceptance `/tmp/loginom-tui-multichat-yhWkiU` used one headless TUI process
and one private profile from the final native payload. The actual TUI attached
sales.csv in the first chat, then /new created another chat and attached changed
bytes under the same filename. Real Dock prepare/deliver verified each SHA256;
runtime session IDs, artifact IDs and remote paths differ. SQLite contains exactly
two chats with two completed tools each. Exit 0, forced=false, guard=false.
[Summary and hashes](tui-multichat-summary.json). This is attachment/delivery
isolation, not another full grouping/save oracle or a parallel chat scheduling test.
Permissions were explicitly skipped by this manual fixture as in the existing
oracle; separate permission evidence is not replaced by this check.

Two earlier attempts remain in `/tmp/loginom-tui-multichat-cNf1ca` and
`/tmp/loginom-tui-multichat-5RhSm0`. Both completed first-chat prepare/delivery but
failed to advance to another chat and were cancelled; neither is a PASS.
Investigation identified a possible scripted-provider finish/next-action race,
then terminal tracing showed /new still in its menu after a combined text+Enter
write. The driver now awaits provider onFinish and sends Enter only after a
separate /new write and observed New session menu. The final two-chat transcript
verifies the transition; no old delivery was replayed. Host typecheck PASS.

All three attempts were traced over their setup/TUI/prepare/delivery/new-chat/exit
paths: 2434 files, 1362347 syscall lines, zero references to the four checked
Desktop global roots. This is a concrete end-to-end TUI path audit, not proof for
all imaginable commands or timing. Raw traces and terminal text remain private.

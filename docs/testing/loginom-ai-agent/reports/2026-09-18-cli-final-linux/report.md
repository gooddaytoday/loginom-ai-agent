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

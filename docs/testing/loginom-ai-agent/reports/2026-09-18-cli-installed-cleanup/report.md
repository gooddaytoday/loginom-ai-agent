# Linux full artifact: CLI error-path exit fix

Version `0.1.4-cli.202609180135`, channel prod, dirty development candidate.
Source commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`;
source snapshot `2a7a53c4071bec39e8a5ba12a3aef0fdbe25fae926a73587f91f19d8656f6ae3`.

Full artifact `/dev/shm/loginom-cli-cleanup-202609180135`;
archive `/dev/shm/loginom-ai-agent-cli-0.1.4-cli.202609180135-linux-x64.tar.gz`.
SHA256 `74af01b9c6480c74e83117ad009960fc63aafac776956449becf0b78c7e6a0bb`.
Build log `/tmp/loginom-cli-cleanup-202609180135-build.log`.

Build, native version smoke, source snapshot stability, artifact manifest and
extracted archive verification PASS. Build workspace is tmpfs because persistent
disk had only ~1 GB free. These tmpfs paths are ephemeral, not durable storage.

Actual install.sh PASS; installed payload
`/home/kiselev/.local/share/loginom-ai-agent-cli/0.1.4-cli.202609180135-prod`,
launcher `/home/kiselev/.local/bin/loginom-ai-agent-cli`.
Installed --version and --help PASS with PATH=/tmp/loginom-cli-path-1930
(no Node/Bun/Chromium/Desktop). No development bundle override for live acceptance.

## Installed host crash: PASS

Evidence `/tmp/loginom-cli-owner-crash-Czz85v`; log
`/tmp/loginom-cli-installed-host-crash-0135.log`. Installed launcher, no bundle
override, restricted PATH. SIGKILL host after active import receipt and durable
recovery: code 1, deadlineExceeded false, all 24 processes ended, guard retained,
retry status code 3/PROFILE_BUSY. Recovery
`c5b38e71-2bd2-4cd2-8a94-6fcdf2dd7e27.json` retained. Real Loginom/Chromium,
scripted model provider. No recovery acknowledgement/replay.

Actual uninstall.sh PASS; launcher and versioned payload absent afterwards.
All 3965 profile file hashes exactly matched before/after uninstall, including
recovery evidence. Profile/guard intentionally retained.

Archive copied to persistent disk:
`/tmp/loginom-ai-agent-cli-0.1.4-cli.202609180135-linux-x64.tar.gz` with matching
`.sha256`; checksum independently re-read and matched the build output.
The first verification helper attempted unavailable Python hashlib.file_digest;
copy had completed, and compatible streaming SHA256 verification succeeded.
The artifact directory remains in tmpfs and is ephemeral.

This closes installed acceptance of the error-path exit fix for the tested
host-crash case. It does not cover every crash timing, network loss, real model
provider, native Windows/macOS or release signing.

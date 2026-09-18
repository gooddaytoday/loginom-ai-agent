# Linux native source candidate — 2026-09-18

- Version: `0.1.4-cli.20260918native-src`, channel dev.
- Clean source commit: `1feb99775e023775af8fdfeb8ffa5793e6571aec`.
- Source tree SHA256: `8a73b4d540300ce2daa3c13ca2bff8e085b6171c1f4868b86145cd972d63bbe6`.
- Payload: `/tmp/loginom-linux-native-sources`.
- Archive: `/tmp/loginom-ai-agent-cli-0.1.4-cli.20260918native-src-linux-x64.tar.gz`.
- Archive SHA256: `06a0dad94ad9e7c5438609629387c0bf963beb93d6a0309bccdd096393154652`.
- WebKit companion: `/tmp/loginom-cli-webkit-source-companion`, separately supplied.

Native build version smoke, source stability, manifest and extracted archive
verification PASS. Independently checked all 47 delivered Bun native/source
file hashes. Delivered WebKit pin equals the source companion pin. Binary
--help/--version exit 0 and create no profile files in isolated HOME/XDG paths.
No new installed functional scenario is claimed: runtime sources are unchanged
from the previously tested candidates, whose oracle results retain their original
artifact identities. Desktop installation was not changed.

This archive adds complete in-tree Bun native source, ICU notices, complete TinyCC
source and WebKit companion metadata. The companion is built and checksum-verified;
it has not been published. Remaining work includes external dependency coverage,
Bun build recipes/patches in the corresponding-source distribution and actual
rebuild/relinking verification. The candidate remains dev-only.

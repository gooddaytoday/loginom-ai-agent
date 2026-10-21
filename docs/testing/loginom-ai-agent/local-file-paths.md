# Local file paths #74 — evidence

## Task 1: native upload completion probe, 2026-10-21

Source `34cb53ba7b`; independent approach and final evidence reviews: Approved. No product changes or model calls.
Evidence/scripts: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/`; this is a direct source probe, not installed acceptance.
Dedicated no-mount Docker pair, IDs in `stand.json`, origin `http://127.0.0.1:32773/app/`, account `user`, Loginom 7.4.2.
Studio `wsproxy: auto` initially selected the shared port 8080; detected before any upload, logged out, changed only the new Studio to `wsproxy: true`.
`reconnect.json` confirms only `ws://127.0.0.1:32773/app/ws/`; shared server/configuration unchanged.
Pinned Node 24.19.0 / Playwright 1.64.0-alpha-1789764292000 / Chromium 1246; Node/browser SHA match `packages/product/loginom-release.json`.
A: `skills-cold/sales.lgp`, 10157 bytes, SHA `ad9e8e3b8e63597d724a26fc88f1fa17dc0c9b396ada0624a2756d13238b3790`.
B: `analytic/holiday-month-sales/reference.lgp`, 9950 bytes, SHA `864834e57e438383aa7d3bf1a3950c89e30253cd2ad44b5544d132998182ea86`.

### Sufficient native predicates

- Before submission: retained document/card/form/sender/input/grid/store, exact origin/build/account/directory, idle sender, destination absent, baseline `store.loadCount`.
- Reuse artifact admission, staged upload lease/verification and the unchanged `makeArtifactUploadCode` body; its original AMBIGUOUS receipt remains in evidence.
- Completion: same retained owner; input empty; active loaders zero; no pending upload paths or conflict; store idle, complete, unbuffered, `loadCount >= baseline + 1`; no visible masks/dialogs.
- Exactly one native file record: `Type=0`, `FileName`, `FilePath=id=destination`, `Size=expected bytes`; fresh UI row agrees with `storage_entry.bytes_source=native_file_store`. No size-text parser or download.
- Open only the confirmed destination, using `prepareWorkspaceSession` + `makeWorkspacePrepareCode`, then the existing geometry reader in the same context.

### Measurements and controls

- A: upload 150 ms, upload plus fresh row 257 ms; return to home/open 1762 ms; geometry 4 ms (`upload-a.json`, `open-a.json`). Manual gaps are excluded; no continuous A total is claimed.
- Continuous A → B: binding/Files 542 ms, upload 163 ms, upload plus row 296 ms, return to A 82 ms, open 802 ms, geometry 2 ms; total **1915 ms** (`route-b.json`).
- B has a new operation/workflow ID in the same document; metadata changes `workspaceReady: false → true`, B's exact path is verified, preserved A graph is unchanged. No second browser/context or draft.
- Paused only the owned server during another upload: input still contains a file, no destination row, completion pending; after unpause the new generation/exact row completes (`while-paused.json`, `delayed.json`). No resubmission.
- Conflict: current upload code returns `UPLOAD_DECISION_UNKNOWN` after earlier dialogs because it hardcodes `msgbox`; the observed conflict was `msgbox-1`. The unchanged refusal is retained in `conflict-receipt.json`.
- Task-local binding of the existing conflict helper to that exact observed prefix confirmed `reject`, idle sender and unchanged destination size, without overwrite (`reject-observed-conflict.json`). Product conflict handling is not yet fixed or certified.
- Negative fixture `calc-data-double/reference.lgp` is 7.5, not 7.4.2: native open refusal retained; its owned package was closed/discarded. The successful B control used the accepted 7.4.2 fixture, with a fresh harness observation state; this does not prove product recovery after open failure.

### Decision and implementation implications

Read-only completion is feasible; neither control download nor draft/delivery fallback is needed. Source SHA describes admitted bytes, not a downloaded server copy.
Current open helper waits for home/graph and times out from Files (`workspace_entry_ready`, effect=false). Restore the confirmed entry tab or admit the specifically bound Files surface before existing open; cover this in task 3.
Also cover the observed conflict-dialog suffix in the shared upload/conflict boundary. Preserve all existing owner, dialog-content and reject guards.
Measured route fits 105 s runtime / ~120 s Host / >=180 s adapter; these small local fixtures do not prove worst-case latency. Task 3 must retain a coherent overall deadline.
Downloads: **0**. Local source hashes unchanged. Owned temporary packages closed with diagnostic discard, logout SUCCEEDED; browser disconnected and upload leases released (`cleanup.json`).
`stand-cleanup.json` records zero browser processes and removal of only the created no-mount containers/network; existing stands were retained.

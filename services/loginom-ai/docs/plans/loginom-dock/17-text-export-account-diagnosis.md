> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-8106fdd73094` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Node17 — bounded account-probe diagnosis

Assignment: `node17:account-probe-diagnosis:1:95a8105c`.
The previous timeout remains FAIL, with its UI substep unknown.

## Transport check before the one diagnostic session

Source evidence: `bridge.mjs` awaits `browserGate(prepareWorkspaceSession)` before
returning the preparation reply. `createSerialGate` in `clipboard.mjs` waits only
for the supplied operation, not the outer public callback. MCP SDK Protocol
handles response messages independently of pending request handlers. The pinned
Playwright backend runs a code callback before its bounded post-action settling;
its request context is separate from the caller's public server.

A focused test with actual SDK Client/Server, InMemoryTransport and the actual
source serial gate confirmed that a second browser response can arrive after
preparation releases the gate while the outer public prepare still awaits its
post-handler probe. This is a transport/lock unit check, not live-browser proof.
It gives no evidence that the historical timeout was a deadlock.

The probe now records bounded started/completed read/open/close steps and their
small observations, with no whole menu text. The browser budget is at most 20 s,
with at least 10 s left before the 30 s host boundary. At most 32 observations /
96 steps are retained. Unconfirmed closure returns a partial failure; all awaited
UI operations have settled when the function returns. Browser errors are reduced
to a fixed code and error class to avoid logging incidental menu contents.
Transport failure closes the sole owned browser client before propagating the
failure; the outer diagnostic runner closes the source MCP and checks processes.

A diagnosis-only entry purpose admits only the assigned dock_prepare; other
public tool calls are refused. The one-shot diagnostic runner has no input
artifact, stdin continuation, upload, node call, observer, replace or Hermes path.
No product/runtime/config changes were made. Six focused Node tests and twenty
Text export Python tests passed. The frozen candidate has runtime155/harness275.

One fresh diagnostic session and one probe are authorized after this checkpoint.
The minimal user-v1 component run remains a separate future assignment.

## Native localization and narrow correction

One diagnosis-only run `20260913-153521-37ca4f5b` used session
`4d3d1826-3d57-47c7-8fb2-ccfae855fbb8` on diagnostic harness commit `3a38af33`.
It returned bounded partial raw evidence in 3137.61 ms (browser 3132 ms).
The native account line was visibly **test-2**, with exact actual URL,
prepared document/session/workflow/tab, build 7.4.2 and user-v1 session profile.
The menu opened, account inspection completed, Escape completed at 100 ms,
and the menu remained visible in all 29 post-close observations. The probe
stopped at its 32-observation evidence cap with `ACCOUNT_EVIDENCE_LIMIT` and
`closed=false`, `pending_ui_actions=0`.

An independent read-only audit checked the actual preparation journal and
session profile, raw response/value identity, every owner observation and the
native code SHA reconstructed from the exact diagnostic commit. This establishes
a close-gesture failure in this run. The nested browser call returned normally;
a transport/prepare deadlock was not reproduced. The older 30 s timeout stays
FAIL with its original substep unknown; the new evidence must not retroactively
invent that missing observation.

The confirmed weak close path was changed only in the acceptance helper:
require a fresh unique Avatar and the same native document/session/workflow,
confirm `menu_count=1`, then click Avatar once and verify disappearance. There is
no repeated closing gesture or fallback loop. Six focused Node tests and twenty
Text export Python tests passed after this correction. **The new close gesture
is not yet live-verified.** No second diagnostic probe was used to test it.

Candidate pins were refrozen with runtime155/harness275, manifest SHA
`47e8a6e14a9b43a98e8399cdba2f1ebc013b775475c10fecab368adcaddda00b`.
The diagnostic request retains its original `36a0d99c...` manifest and source
pins. Three post-diagnosis changes (helper and two focused tests) are explicitly
recorded in the audit. Runtime/product/goal22/3/all save-reopen remain unchanged.

Only dock_prepare was requested. Baseline, uploads, node.apply, observer, replace
and Hermes counts are all zero. The own browser was closed, its process check
returned no PIDs; the global config hash remained unchanged. Menu closure by
the old Escape is **not** attested; browser termination is independently checked.
Server logout is not claimed. Free disk afterward: 95,360,319,488 bytes.

**Readiness: candidate prepared for a separately assigned minimal user-v1
attempt, with live validation of the new close step still required before
baseline.** User-v1 component and full goal are not accepted. Full admission
remains closed on missing native component evidence; no next run is started.
The coordinator owns the next concrete assignment.

[Exact diagnosis, checks, next trigger and evidence digests](17-text-export-account-diagnosis.json).

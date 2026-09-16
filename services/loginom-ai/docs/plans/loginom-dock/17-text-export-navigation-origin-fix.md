# Node17 — navigation/origin harness correction

Assignment: `node17:observer-navigation-origin-fix:1:e74d14d2`.
Scope: acceptance harness only; handler source remains `2524921058b29db0e79e9a188ec7bb8fa9ef9d8c` and runtime remains `347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c`.

## Checkpoint before the authorized new smoke

The previous run `20260913-142510-94897ed4` remains historical INCOMPLETE:
zero observer downloads, zero actual replace dispatches; the original auditor
KeyError remains in its immutable raw/audit evidence. A separate read-only
reanalysis of its original 124-byte baseline now passes the corrected auditor;
this does not promote the old smoke to PASS.

After one navigation gesture, the observer resamples fresh roots/root observations
with a 250 ms pause between incomplete samples. It retains the original absolute
observer/overall deadline (at most 60 seconds), checks cancellation on both sides
of awaited operations, and never retries the gesture. Observations must retain
origin/build, UI document epoch and exact tab/prefix owner. A folder transition
allows only the observed old `/` and requested `/test-2`; unknown paths/owners,
dialogs and document changes fail closed. Workflow return waits for the original
owner before the single final graph read. The finite ledger cap is 512 read/action
entries; the time limit remains the controlling bound. Rows also retain the
observed Files owner. No configure/execute/save actions enter the observer.

The byte auditor and outer binder derive origin from browser observations linked
through `prepared_node_context` to the same prepared graph document/workflow/node.
They bind session, runtime and the actual profile/build/platform/browser from the
journal. They distinguish the browser epoch from the prepared graph document ID,
reject conflicting origins and missing native origin, and never substitute a
requested URL or mutate raw evidence. Current actual result profile is diagnostic;
a successful operator smoke cannot establish native user-v1 acceptance.

Focused checks: 19 Node tests and 16 Python tests passed, including delayed folder
settling with one gesture, deadline/cancellation, foreign owner/document/path,
13 origin-evidence mutations and the existing 24 proof mutations. An independent
native audit entry is prepared to check original/replacement bytes, failed reject
without execution, actual dispatch/outer binding, 24 mutations of a native proof,
12 native-origin mutations and 9 existing native event mutations.

One fresh own test-2 smoke is authorized after this checkpoint commit. Its baseline
setup is outside the single <=60-second observer interval. No Hermes execution,
user-v1 claim, admission switch, production/client/runtime change, review or merge
is authorized by this checkpoint.

## New native smoke result — candidate evidence-ready

Checkpoint commit: `79e648b22d7933f0003dc070283d28ccf114cd43`.
New run: `20260913-145112-3a826200`; own session:
`ad741537-e407-4594-8f06-32d44abc2864`, account/storage `test-2` / `/test-2`.
Observed result profile: **diagnostic**, not user-v1. Fresh browser geometry:
1508×862, viewport null; available screen 1512×949. No prior own browser processes;
98,901,921,792 free bytes at launch. All 155 runtime and 265 harness inputs matched
through the completed audit; no product/runtime changes were made.

Exactly one observer interval completed in **1464.16525 ms**, with 21 native
browser steps. After one folder gesture, the first roots/root pair still showed
`/`; the next fresh pair showed `/test-2`. Exactly one observed native download,
one workflow return, one actual dispatcher anchor, and one subsequent product
`node_apply_prepared` for the unchanged replace request were verified. Original
and replaced CSV both matched all 124 bytes and SHA-256
`9f9972ed174053d02745df8df0c3c2d44697b33f7fb6da2ce8463eb58cc5d13a`;
the reject did not execute. Independent byte audits, native proof and outer
journal/dispatcher binding passed. Mutating temporary evidence copies rejected
24 native proof changes, 12 native-origin changes and 9 existing event changes.
Raw evidence was not edited, reused as a synthetic positive, or replaced.

The new browser was closed and the exact-session process check returned no PIDs.
The run occupies 33,466,394 bytes; 98,625,212,416 bytes remained free afterward.
`logged_out=false` is preserved: server logout was not independently confirmed.
The close helper returned an overwrite-message text using `allTextContents()`;
it did not verify that text was visible. The last stored replace UI observation
had no dialogs or masks. No browser was reopened and no second smoke was run.

**Status: candidate evidence-ready only.** Readiness/admission switches remain
closed. This diagnostic smoke does not prove native user-v1, Hermes acceptance,
applied settings stability, global atomicity, or the complete 22-nodeop/3-delivery
save/reopen goal. Hermes was not started. The coordinator owns the next trigger:
assess these evidence/pins and separately allocate the exclusive Sol/low slot.
The old INCOMPLETE and its original `KeyError: 'origin'` audit remain unchanged.

Evidence: `.dock/node17/native-observer-smoke/20260913-145112-3a826200/`;
[durable checks, source/runtime/harness pins and evidence digests](17-text-export-navigation-origin-fix.json).

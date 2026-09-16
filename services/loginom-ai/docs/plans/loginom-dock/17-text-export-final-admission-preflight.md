# Node17 — final admission preflight

Assignment: `node17:final-admission-preflight:1:79e648b2`.
Result: **blocked before the user-v1 node component**. The real stdio entry
started and prepared owned drafts with effective user-v1, but neither attempt
called a node or started the observer. No user-v1 component PASS or full-goal PASS
is claimed. Hermes was not started.

## Implemented admission and frozen boundaries

The unconditional Python/entry blocker was replaced by local candidate admission
that checks the accepted diagnostic report digest, its 19 raw evidence digests,
actual native outer binding, all 155 runtime inputs, and all 270 current harness
inputs. The old and current harness maps explicitly enumerate seven changed
files; protected observer/SDK/binding/origin/evidence implementations must still
match the diagnostic-tested hashes. The goal digest and 22 nodeops / 3 deliveries /
all save-reopen contract remain fixed. Missing, forged, changed or incomplete
pins fail closed. There is no new public retained-output API.

The real entry runs admission before loading the product client or credentials.
A component purpose is restricted to this exact assignment and isolated run
contract. Full admission additionally requires pinned real user-v1 native evidence
and reruns its public projection and outer binder; currently that evidence is
absent, so full launch fails with `Native user-v1 component evidence pending`.
`NATIVE_SMOKE_ADMITTED` remains false in the legacy offline policy; it is not used
as a constant bypass by the entry. Admission is evidence-dependent.

The future full run creates a private explicit user-v1 config from the operator's
explicit Dock config; the installed/global config remains unchanged. The
manifest is pinned to the existing candidate catalog, test-2 and /test-2.
Public compact workflow refs stay unchanged on the wire and are reconciled only
by the independent auditor against actual preparation/node declarations.
Intentional overwrite rejection is accepted by the user projection only when
native refusal, cleanup, no execution and the exact internal error all agree.
Unknown/mixed profiles, forged error text and unproven refusals fail closed.
The full outer auditor now requires actual user-v1 projection; it still requires
all model, exact-goal, bytes, independent reopen and persistence gates.

Frozen admission manifest:
[17-text-export-final-admission.json](17-text-export-final-admission.json), SHA-256
`d809165a8f1c005e096130ab7e8c2c4fb721595a60387cbf81d4f338d86d91fe`.
Handler source: `2524921058b29db0e79e9a188ec7bb8fa9ef9d8c`.
Runtime: `347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c`.
The manifest contains complete runtime/harness/goal/source/catalog pins, not
an admission boolean. Its `user_v1` field remains null.

## Real entry observations and bounded correction

Both runs used `StdioClientTransport` → `text-export-observer-client.mjs` → the
unchanged `client/bin/loginom-dock.mjs`, explicit isolated config, the actual
Loginom browser, and preserved original MCP replies plus internal journals.
Both effective session profiles were user-v1. Browser launch was visible,
`--start-maximized`, viewport null, actual window 1508×862.

1. `20260913-150839-21b24b59`, session
   `d9044f27-7f19-4bba-93cb-59c1444451eb`: account check wrongly assumed the first
   public observation page was complete. Actual page returned 15 of 238 records
   with an issued next cursor. It failed before baseline (node_apply 0,
   observer 0). The original failure and diagnosis remain unchanged.
2. After diagnosis, exactly one corrected entry was attempted:
   `20260913-151004-11ecca67`, session
   `c562fc39-763e-46c3-bbc3-62c58f13a597`. It consumed the supplied page cursors
   without another avatar gesture. Four delivered pages retained the same
   observation ID and document; the next cursor request returned real
   `REQUEST_REJECTED`: “Workspace changed between observation pages”. The
   harness then failed closed. No node_apply or observer started.

The latter failure was not a successful page with a different ID: it was an
explicit runtime rejection, and the harness's generic “Account observation
changed” message is retained as emitted. Full internal observation records read
for diagnosis contained 151 UI elements but no label containing test-2. This does
not establish that the account changed; the account title was simply not among
those exposed labels. Earlier diagnostic fixed native `AppMenuForm.innerText()`
did observe test-2. Repeated all-page traversal is therefore not an adequate
account-identity strategy for this component preflight. No runtime/handler change
or third session was attempted.

Both own browsers were closed; exact-session process checks returned no PIDs.
Global config content was unchanged in both runs. Server logout remains
unverified. Final free disk: 97,027,256,320 bytes. Private configs are not in Git
or in the published evidence digest manifest; raw original wire and journals
remain local under `.dock/node17/user-v1-component/`.

## Checks and next trigger

19 observer Node tests, 20 Text export Python tests and 6 user projection tests
passed. Tests cover missing/tampered admission pins, profile isolation, expected
native rejection, forged public error, source/owner/deadline constraints and the
existing observer negatives. The previously accepted diagnostic native smoke
still passes component admission. Both newly observed stdio preparation runs
are evidence of entry/profile setup only, not of node execution or native bytes.

Next owner: coordinator. Next concrete trigger: choose a bounded account-identity
observation for the real stdio preflight (the previously verified fixed private
native account probe is a concrete candidate), then issue a targeted continuation.
Only after that user-v1 baseline/reject/observer/replace and its independent wire /
native / origin / outer audits pass can user-v1 evidence be added to the manifest.
Then separately allocate the exclusive Hermes openai-codex / gpt-5.6-sol / low
slot and one full goal run. Do not launch Hermes from this checkpoint. Full goal
remains exactly 22 operations, 3 deliveries and all independent save/reopen gates;
no production, main, VPS, plugin, routing or next-node work is included.

[Durable evidence digests and run/phase checkpoints](17-text-export-final-admission-preflight.json).

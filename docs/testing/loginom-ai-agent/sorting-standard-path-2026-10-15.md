# Sorting: ordinary CLI startup, 15 October 2026

Owner decision: LAB-70 comment `01a13fdd-93df-7092-a7a0-f7f41eced2b0`.
Starting candidate: `76f443d3c2991a93bfbcdeb56617059d1ec1377e`, PR49.
This change isolates an experimental startup hook; it does not certify native
Sorting, successful saving, resource recovery, or the full acceptance matrix.

## Actual routes and retained checks

| Dependency | Ordinary route / purpose | Disposition |
| --- | --- | --- |
| `standalone-cancellation.ts`, `original-run-control.ts`, `original-root-port.ts` | One original 7200-second run, cancellation, owner/child association and rejection of copied/repeated controls | Retained unchanged |
| `standalone-run.ts` → `launchNodeHost` | Standard build does not define `LOGINOM_AI_AGENT_SORTING_ACCEPTANCE`; it does not choose `launchSortingDiagnostic` | Retained; source entry test covers standard selection and original control |
| Host adapter / `host-port.ts` / durable journal | Owner leases, pending/UNKNOWN and original request protection | Retained unchanged |
| `terminal-managed-call.mjs` and root association | Ordinary `dock_prepare` also retains the actual managed request/task/controller and original deadline. The terminal filename does not make these checks optional | Retained unchanged |
| `startupOwner` / `loginPage` | Account, origin, document and native startup cleanup, with durable evidence before context exit | Retained unchanged |
| `workspace.mjs` ordinary preparation | `terminal` and `creationToken` absent: `retainOriginalRealm=false`. Existing UI, document, package, workflow and operation checks still apply | Retained unchanged |
| `bridge.mjs` / save and package cleanup helpers | `savedPackages`, `managedSave`, same session/document/tab/account/package/build; refusal for unsettled work or missing confirmed save; durable native and transport cleanup receipts | Retained unchanged; these receipts are required for ordinary success |
| `terminalUserPublisherScript` | Previously installed by every managed login, with readers in the private `retainOriginalRealm` branch in `workspace.mjs` and private `terminal-script-witness.mjs` | Install only when the existing private `sourceLoad` exists |
| Source integrity, response pins, browser witness, Inspector / bound receipts | Already conditional on private source-load admission; support the experimental original-draft diagnostic, not ordinary save/close authorization | Preserve source/history and private checks. No ordinary readiness or permitting witness is synthesized |
| `browserDownloadScript` | Ordinary authenticated browser download/save initialization | Retained on both routes, with the private init-script ordering unchanged |

The ordinary route has no demonstrated requirement for publisher interception.
Removing its unconditional installation avoids instrumenting vendor publishers
in a new business scenario. This does not establish the cause of the historical
SIGSEGV, and does not fix or resume the rejected debugger/caller migration.

## Targeted validation and next gate

The new ordinary-init assertion fails against the starting candidate because
`terminalUserPublisherScript` is invoked without a private source load. With the
change, startup/source-load tests and Sorting handler tests pass: 184/184 on
pinned Node 24.19.0. Private startup ordering and negative admission cases remain
covered. The ordinary CLI entry test uses the actual entry/adapter with parser
and backend doubles; it checks ordinary launcher selection, original control,
no acceptance capture, and host-close-before-lease-release. Original-root launch
tests use a real pinned Node child with a fixture protocol, not Loginom.

These are source/offline results, not installed or business acceptance. Browser,
Page, native application and provider operations are not performed by these tests.
The startup instrumentation boundary requires independent safety review before
the corresponding native/model run. Review whether ordinary account/document,
original deadline, saved-result, journal/UNKNOWN and cleanup protections still
stand and whether any ordinary consumer of the removed capture was missed.

After that review: build the exact clean candidate with the existing builder,
verify task/inputs/model/profile and release or isolation of the old resources,
then run the first independent Sorting business scenario through the standard
CLI. Give the model only business task and inputs, not this report or oracle.
Continue the previous Sorting matrix, regressions and independent cold-check.
Old crash logs, pending/UNKNOWN, profiles and `.writer` remain preserved; the
historical full-script regression FAIL and combined SIGSEGV are not marked fixed.

## First installed startup observation

The clean installed candidate `30309e49` passed the official verifier. Ordinary
setup failed before login submission: initial navigation exceeded its 60-second
cap, and cleanup refused `STARTUP_DOCUMENT_CHANGED`. The failed profile, writer
and journals were preserved; exact owned processes were released under the
approved recovery procedure. No package or unique business result existed.

A separate public navigation with no credentials also exceeded 60 seconds; its
main-document HTTP 200 arrived at about 99 seconds. The next independent attempt
uses a 120-second per-navigation cap. The enclosing private request remains
bounded by its existing 180-second timeout; the original run control/deadline,
account/document checks and unknown-effect handling are unchanged. No pending
navigation is resumed or given a new deadline.

The embedded models snapshot lacked the assigned model. Standard `models openai
--refresh --verbose` populated the isolated profile cache and listed the exact
`openai/gpt-6-luna` model with `high`. No model substitution or model invocation
was used to repair preparation.

## Ordinary managed preparation and retained refusals

The initial map missed an active bridge gate: `beginTerminalManagedCall` is used
for every managed `dock_prepare`, while `requireTerminalPrepareProvider` requires
a private original lender/source load. Ordinary startup has neither. The actual
MCP protocol regression now uses the real managed-call custody around its
ordinary preparation requests: the previous code fails with
`LOGINOM_ORIGINAL_PREPARE_INVOCATION_UNAVAILABLE` before workspace preparation.

The bridge now selects that experimental provider requirement only from its
existing private `acceptanceCapture.binding.harness`. Public request arguments
do not select the branch. `terminalManagedCallForBridge` is still called on
ordinary requests, preserving its original guard. The original lender's
`requireInvocation` remains mandatory when a lender actually exists. No success
witness is constructed and the provider implementation is unchanged. A protocol
negative control supplies a private diagnostic with a missing provider and
confirms refusal without a browser call. Ordinary invalid preparation still
refuses, then the same protocol connection can prepare and create a fixture node.

This admission selection needs independent safety review before a live
`dock_prepare`/package mutation. No model or Sorting node has been run yet.

On clean installed `1f85f06e`, the second ordinary setup progressed through
`loginPage` account readback. Startup shutdown then refused
`STARTUP_NOT_OWN_EMPTY_IDLE`; its historical receipt does not distinguish build,
account, package-count and running-node predicates. It is not evidence of an
empty or idle session. The next candidate records the first failed predicate
from those same ordered checks, without extra native reads or accepting missing
values. Four tests retain refusal/no logout/no context close, including missing
package-count evidence. Both failed profiles/writers and original logs remain.

Only exact owned local processes of this setup were terminated after recording
provenance and exclusion of the workspace daemon. The attempt created no
package, node or business result. Server logout/session closure is not claimed;
old server sessions are untouched. Before the next business run, use the
expanded refusal evidence to establish the supported cleanup/preflight path.

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
| `terminalUserPublisherScript` | Previously installed by every managed login, although its only reader outside its module is the private `retainOriginalRealm` branch in `workspace.mjs` | Install only when the existing private `sourceLoad` exists |
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

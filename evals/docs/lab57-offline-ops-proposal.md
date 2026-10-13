# LAB-57 offline operator proposal

Status: PREPARED / NOT_APPLIED. Installed operational source remains
`89b416c257a43a187edef4c40b68f3c9b1fa4d53`; live GREEN is NOT_RUN.
This is an isolated source proposal, not a native admission or Ben frozen SHA.
Approval and scope: LAB57-RICH-OFFLINE-OPS-PROPOSAL-01a13531,
issue `01a1214a-fcf8-7e0c-8c1c-f5dd600180b3`.

The saved failure is still PROFILE_NOT_READY, lower cause UNCLASSIFIED,
charge=0. The original helper did not persist the management stdout/exit/view.
Headed management on a host without DISPLAY is a compatibility concern;
the historical lower exception cannot be inferred from it.

## Proposed behavior

The actual preflight status and sandboxed native check both use the supported
`loginom <status|check> --format json --headless` arguments. Their readiness
criteria remain independent: a non-ready status never becomes ready, and the
native check must still return exit0, ok=true and LOGINOM_CONNECTION_VALID.
Credentials, WebSocket, licence, sandbox, profile, process, source, container,
storage and final history cleanup checks remain mandatory. Neither model/run
nor recovery is added. Validator/oracle/typed/GUID code is unchanged.

Management now saves private raw stdout/stderr and process records before any
caller rejects its result. The durable safe receipt contains actual fixed args,
mode, exit/timeout/interruption, original byte counts and SHA256, allowlisted
view state, failure presence, recovery count, actual process-proof hash, and
original owner/acquiredAt/config/container binding. It emits no arbitrary CLI
error text, credentials, environment, stdin, profile contents or writer token.
Malformed/absent view, failure, recoveries, nonzero exit, interruption, timeout,
unknown cleanup or capture mismatch cannot grant READY. Missing lower exception
stays unknown; private capture is available to the authorized operator.

Every preflight creates a separate attempt directory. Existing root admission
is validated against the same lease and never overwritten. The final root READY
seal is created with wx only after the original native and cleanup gates pass;
an already recorded READY blocks repeated preflight. No lease/completion/release
contract is broadened by this patch.

## Offline verification

Genuine supervised RED: missing durable management receipt on exact base.
Genuine supervised headless RED: original flag-free argument selection is
refused by a fake CLI enforcing the supported headless contract. GREEN proves
both status/check argument selection through the actual management process.
Further negative fixtures cover malformed/absent/non-ready views, recoveries,
failure, API-key indicator, exit, timeout, interruption, sandbox, cleanup,
capture, unknown/foreign process, owner/task/role/phase/SHA/acquiredAt/config/
container substitutions, immutable evidence and secret omission. Synthetic
fixtures are tests only; none is a live READY/completion receipt.

Reproduce from this proposal's evals directory with the pinned Bun:
`bun test test/management-evidence.test.ts`; `bun typecheck`.
The delivered command receipts record the proportional existing management,
lease and preflight gate checks and actual supervisor cleanup. A complete live
suite and installed-candidate admission are not claimed.

## Proposed adoption and continuation, requiring owner decision

1. Review this exact patch/source and safe proofs. Approve a new immutable
   supplement pin and manifest explicitly; do not overwrite installed89b or
   silently select an unreviewed helper. CLI candidate remains exact d73a13fa,
   author partial49522, skill1.0.7; shared CLI/default config remain unchanged.
2. Verify all new supplement hashes, both CLI manifests and original resource
   bindings. The held eval lease owner remains task
   `01a134fd-ee87-72f3-9e7c-f69d19fe7fe7`, acquiredAt
   `2026-10-13T11:53:15.320Z`, config SHA256
   `f76b3a6a3a2d28c10b255ef5e9e7542f931f2f55708958f2af3ff9dcfe87b264`.
   A follow-up UUID must not replace it. Under separate live authorization the
   corrected ordinary entrypoint can collect a fresh attempt on these exact
   bindings, preserving old admission/failure bytes. No exported-preflight
   wrapper, model probe or fallback is proposed.
3. Before changing phase/owner/config or acquiring a fresh pilot lease, settle
   the current preflight-only eval lease through a separately approved rule
   (see the NOT_APPLIED document). Existing completion kinds do not authorize
   release of this lease. The historical old-unit once cannot be reused.
4. Only after actual FREE, fresh resource admission and a genuine new lease,
   run the required supervised unit/typecheck and native READY with approved
   pins. Then resume UTF16 reference2, remaining cold/product within cumulative
   budgets and the unchanged 15:33:29.538616Z deadline. If admission fails,
   inspect only its newly durable safe/private output and preserve its FAIL;
   do not repeat an unchanged failure or expand budgets.

Counters unchanged: references1/1/2/1/1/1 of3; product0, repeat1/case;
cold8/7/5; confirmed same-cause repeats3/10; admission3/3; wrapper1/1;
helper recovery0. No scenario/model/native/browser calls occur in this stage.

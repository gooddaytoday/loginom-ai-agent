Native Row Filter matrix, 2026-10-15

The tested Product was clean `fe194a9d7ce23cf2cf6b753fde5f2de2a4f71235`, exact
`0.0.0-dev-202610142257`. All 5681 packaged files matched its manifest.
The accepted golden/model/warm/cold scenario was not repeated.

An independent copy of the original package and a fresh Chromium profile produced
four complete native cases on document `7485ce5c-f793-4601-b620-a6636c6358fd`:
`When_between` 7/3, `Id_compare_0` 5/5, `Id_compare_1` 7/3 and `Id_compare_2` 3/7.
Both native ports were checked against the independent oracle by full positional
schema and multisets of all cells, including duplicate Id 6, NULL and binary64.
Execution suffixes were `:176:2`, `:176:5`, `:176:8`, and `:176:11` respectively.

A separate 25-byte header-only CSV (SHA256
`9169cabf02314b487c7879475fbd2caa6c770f5b3f720a5a8a74c614811ca2e0`)
was imported with the five explicit types. A fresh `When_between` execution
`42ce2909-aa1b-4392-b202-d6b3aec1e92a:327:2` returned two empty outputs with the
complete five-field schema. Package close and logout were both confirmed, 1→0
packages. This establishes empty-input/output behavior, not persistence.

The next matrix case, `Id_compare_3`, is not a PASS. After its Table format Apply
receipt, the exact format dialog remained under a busy loading mask throughout
the 15-second read window. Its output was not accepted. This patch allows only
that successfully acknowledged Apply to authorize a one-use, read-only wait for
the same active Table/port, bounded by the original operation deadline. It
preserves normal observation limits, context checks, cancellation and uncertain
receipts; it neither repeats Apply nor extends the parent deadline. The generic
80-sample cap does not truncate this specific deadline-bound settlement.

The regression uses a simulated delayed mask and native inventory doubles.
It fails on the original module and passes after the patch; controls cover
foreign port, parent expiry, unrelated click, missing Apply and transport loss.
The procedure and output suites pass 122/122. These controls are not native
proof of the new code. Initial diagnostic-script mistakes and native failures
remain in the external evidence, alongside originals and journals.

The failed matrix session `:4383` was closed through the native administrative
UI after checking its exact account, path, birth time, inactive execution,
pending-disconnect state and zero references; absence was verified after refresh.
The discarded reproducible draft is not a native save/logout. The operator did
log out. A failed read-only observer was stopped separately by exact PID after
checking the Multica daemon PID; no native logout is inferred from SIGINT.

Remaining: 84 of the newly requested 88 forms, including `Id_compare_3`, and
persistence of the additional settings. Two previously accepted forms on older
Product remain historical evidence. Full stage 0 and native acceptance of this
correction remain open; stage 1, merge and release are outside this cut.

The following cut addresses the fresh cold-header failure of `open_node_views`
(after its single click, document `50edb1a3`, operation `n45`). That historical
AMBIGUOUS action is not resumed. The fixed node procedure gives this verb the
remaining original parent deadline through private `opening_timeout_ms`; other
wizard openings retain their 45000-ms ceiling. The browser's post-gesture
`surface_pending` loop uses that deadline instead of its 900-sample ceiling.
Authentication, package/workflow/node identity checks and the original one-click
preconditions remain. Admission still requires an exact prepared node binding
and a positive safe integer. The focused browser-capability control has a
70-second transition, an expired parent and a foreign-node refusal; it counts
one gesture in every route. Its DOM/native inventory and clock are doubles.
The old module rejects the same 120000-ms request before the gesture.

These are the filesystem-only cases from the approved stage-zero matrix.
`task.md` is the model's business request. Fixtures, expected tables and the
oracle remain private to `run-check`; none is attached to the model conversation.

`run-check start --head <sha> --scenarios js-fs-read,js-fs-write,js-fs-operations,js-fs-effects --pair <pair> --cold`
followed by `run-check wait <output>` runs the ordinary model, full table, CSV,
Save, cold and cleanup checks. Repeat with new output directories on the same
SHA for the required independent attempts. This directory does not contain a
second runner or an alternate browser execution path.

The existing fixture preparer creates a unique subtree in the assigned account.
Read fixtures use the native upload control; their completion is confirmed by
downloading that input folder as a normal Files ZIP and comparing the original
bytes. After the model closes the package, and again after cold, the preparer
downloads the affected folder through `FileStorageForm;btnDownload`. The oracle
checks every archive entry, file byte and directory, including missing, extra
and duplicate entries. A model-provided Hex column cannot establish this proof.

`js-fs-effects` additionally checks the partial empty destination left by failed
`COPYFILE_FICLONE_FORCE`. Its append-only ledger must contain one line after the
model run and two after the single cold execution. Reconfiguring, reading or
saving cannot silently add executions; copying is never retried or repaired.

The oracle's negative controls live in
`scripts/node-acceptance/tests/javascript-fs.test.mjs`. No HTTP fixture is used.

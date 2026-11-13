These are the filesystem-only cases from the approved stage-zero matrix.
`task.md` is the model's business request. Fixtures, expected tables and the
oracle remain private to `run-check`; none is attached to the model conversation.

`run-check start --head <sha> --scenarios js-fs-read,js-fs-write,js-fs-operations,js-fs-effects,js-fs-errors,js-fs-paths --pair <pair> --cold`
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

`js-fs-errors` prepares KEEP and a mode-zero DENIED file through the production
JavaScript node lifecycle in a private fixture draft before starting the model.
The model never receives that fixture code. Audit downloads the protected KEEP
bytes and checks the complete native Files inventory, without reading DENIED or
changing its permissions. The model must report exclusive-create, missing-file
and permission failures as failures rather than successful empty reads.

`js-fs-paths` checks a unique relative sidecar name first in an unsaved package,
then beside its saved LGP. The existing fixture helper moves only that closed
LGP through Files Cut/Paste; downloaded package bytes must remain identical.
The next model continuation observes the missing sidecar. A separate delivery
then supplies it beside the moved LGP. Full typed tables/CSV are checked at each
stage, node ID and source digest remain constant, and final cold uses that saved
package without changing its code.

The oracle's negative controls live in
`scripts/node-acceptance/tests/javascript-fs.test.mjs`. No HTTP fixture is used.

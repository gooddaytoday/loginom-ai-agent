LAB-15: single tabular TXT fixtures, addressed part of stage 1.

`../matrix-fixtures.py` generates original bytes and independent expectations
in `manifest.json` (18 positive cases and 4 negative fixtures). Expected tables
are never mounted in the model process. No production input is converted.

Run each positive case on a new managed profile using `../run-matrix-cli.py`
with `--worktree`, `--config`, `--out` and `--case`. It verifies candidate SHA,
CLI readiness, exact admitted/delivered bytes, all warm cells, saved native
settings, downloaded source bytes and fresh complete cold readback.
Any exception, incomplete table or unconfirmed cleanup exits nonzero.
Unknown effects preserve the attempt without session release or replay.

Negative outcomes and the original transactions/CSV/TSV regression require
separate real CLI evidence. Fixture generation or unit tests alone certify none
of these cases. Review requires all designated cases on the same published SHA.

`ambiguous_headers` is a repeated-source-reference test, not a missing-field
test. Run `../run-negative-cli.py --worktree "$PWD" --config <worker.json>
--case ambiguous_headers --out "$PWD/.multica-node/attempts/<fresh-attempt>"`,
then, only after its CHECK_NEGATIVE and exact preflight refusal audit, run
`../run-ambiguous-headers-cold.py --attempt <same-attempt> --config <worker.json>`.
The tracked task/settings under `../negative/` request distinct outputs
FirstName/SecondName with source_name=Name twice. The oracle requires the exact
Duplicate source column names refusal, a single verified original upload, no
started import operation, no alternate mutation and an independently reopened
saved graph with zero imports/links. Cold native storage downloads confirm the
original bytes/SHA; native package closure/logout are mandatory. This proves
repeated references are refused before Execute; it does not claim that Loginom
rejects its own normalized Name/Name_1 schema. The historical OtherName request
is retained separately as `missing-field.*` and cannot satisfy this case.

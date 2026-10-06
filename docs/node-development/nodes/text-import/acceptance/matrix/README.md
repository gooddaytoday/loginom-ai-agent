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

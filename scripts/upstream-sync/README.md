# upstream-sync

Tools of the OpenCode update procedure. Read [docs/upstream-sync/procedure.md](../../docs/upstream-sync/procedure.md) first; the decision is in [ADR-0001](../../docs/upstream-sync/adr-0001-modular-integration.md).

| File | Purpose |
|---|---|
| `sync-upstream.sh` | `pin` / `prepare` / `check` / `accepted`: a rehearsal of an update in a fresh clone; never touches the working branch, never pushes |
| `measure-conflicts.sh` | The LAB-198 metric: unmerged paths after a clean trial merge of an upstream commit (settings fixed, see the header) |
| `conflict-classes.py` | Before/after table of conflict classes; unknown paths are `unclassified` and fail the run |
| `verify-accepted.py` | Proves that upstream's changes were merged, not discarded by taking the fork's whole file |
| `apply-identity.py` | Gives new upstream code the fork's external names (`LOGINOM_AI_AGENT_*`, `.loginom-ai-agent`, `loginom-ai-agent.json`) |
| `compat-snapshot.ts`, `compat-compare.ts` | External-compatibility snapshot of a checkout and its comparison (identity, packaging, env names, CI triggers, resources) |
| `catalog-check.py` | Every file that differs from upstream belongs to an entry of `docs/upstream-sync/catalog.json` |
| `selftest.sh` | Offline test of the procedure on a synthetic upstream and fork |
| `revert-names.py`, `rename-lock.py` | One-time tools that returned the internal names to upstream (history, not for reuse) |
| `reference/` | Baseline of LAB-198: 69 conflicting paths of `2e6f66a9` + `v1.19.4`, their types, the 21 that remain when only internal names are restored |

The full LAB-199 research (classification of 2650 files, counterfactual merges, churn windows) is on the branch `lab-198-s1-research` at `96c8bc4ebf2c5c5fd8f0c7d968085e7e5be4a316`.

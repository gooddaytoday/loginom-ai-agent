# Multi-output table oracle v1

`scripts/node-acceptance/multi-output-oracle.mjs` implements the explicit
`loginom-multi-output-v1` expected/observation table contract. It imports no
Loginom modules. `compare-output.mjs --expected ... --observation ... --output ...`
returns exit 0 only for comparator PASS, and exit 1 for comparator FAIL.

The cold runner accepts an explicit `loginom-cold-scenarios-v1` envelope with
`package_path` and `scenarios`. Each scenario has `id`, `nodes`,
`output_node_type`, `graph`, `settings`, and the independent `oracle` document above.
Graph binding contains exact native node GUIDs/types/input/output indices, links,
and navigation labels. Cold UI document/workflow refs are newly created; the
retained workflow identity is rebound only after this complete saved graph audit.
The candidate manifest must be clean and match oracle `owner.source_sha`.
Each scenario launches one fresh completed execution and reads all oracle ports.
Active filters, incomplete pages and schema without fresh data-kind evidence fail.
A new native Table enables its filter checkbox with a complete empty predicate list.
Cold read may disable that empty default only when `predicates_complete: true` and
`predicate_coverage: "complete_empty"` are freshly observed. Nonempty, hidden or
incomplete predicates are refused without clearing them; the modal is cancelled
before precision restoration so the primary refusal remains visible. The final
observation must still have `filter_enabled: false`.
Legacy expected without `version` keeps its separate single-port comparator.
Unknown versions do not fall back. Node-plan specifications require an explicit
adapter; they are not executable inputs merely because they have familiar fields.

`accept-node.sh --scenario-set <json>` accepts `loginom-scenario-set-v1` with
`scenarios: [{id, directory}]`. Directories are contained node acceptance fixtures
with their own task/data/expected. Every scenario runs the normal CLI7200s/cold
route in a new attempt; exit codes and input bytes/hashes remain in the aggregate
result. Unconfirmed cleanup stops the set before another live run. Expected and
oracle remain outside the model workspace. Live third-port checks belong to the
subsequent handlers and are not replaced by synthetic controls.

Both documents carry `version`, `owner`, and `ports`. Owner has exact
`source_sha`, `package_path`, `workflow_id`, `node_id`. Expected ports contain
`index` (0–2), `role`, native `guid`, `schema`, `comparator`, `rules`, and `rows`.
Observation ports contain the same index/role/GUID/schema, `execution_id`,
`schema_source: "fresh_native"`, `filter_enabled: false`, `complete: true`,
`row_count`, and `rows`. Observation execution has `id`, `status: "completed"`,
`fresh: true`, `owner_verified: true`. Every port must share this execution ID.
The native adapter must establish these claims from owned native evidence;
the comparator cannot independently authenticate a producer's fresh flag.

Schema order is explicit: each field has zero-based `index`, technical `name`,
`label`, scalar `type`, `data_kind`, `null_semantics: "typed_null"`. Rows are
arrays in this order; each cell has exactly `type`, `is_null`, `value`. Integer
values are canonical decimal strings, never Number. Typed NULL has value null;
string `"NULL"`, empty string, false and zero remain distinct. Real values must
be finite. Empty outputs retain full schema and ownership.

Each field rule is `{kind: "exact"}` or `{kind: "computed_real", atol?, rtol?}`.
Only computed real fields accept tolerance. Default atol/rtol are each 1e-12,
tested on independent small zero/one fixtures; the formula is
`abs(actual - expected) <= atol + rtol * abs(expected)`. Payload/count/lag/int64
use exact rules. Fixture authors must justify explicit alternatives before a run;
failure does not authorize increasing tolerance.

`sequence` preserves order; `multiset` preserves occurrence counts and uses a
complete bipartite match for overlapping tolerance intervals. Unknown fields,
versions, comparators, rules or invariants fail closed.

Expected additionally contains `invariants`. A `partition` invariant specifies
`ports`, exact `sizes`, independent typed `source_rows`, `provenance_field`, and
boolean `replacement`. Source occurrence identities are unique and non-null.
All partition schemas match. Every observed occurrence must preserve the entire
independent source row exactly. Without replacement, each source occurrence
appears exactly once across these ports. With replacement, repeated source
occurrences are permitted, while sizes and payload/provenance remain exact.
No Loginom PRNG is reproduced. Each port using comparator `invariants` must be
covered by an invariant; its expected `rows` is empty.

Graph links, effective settings, input hashes, save/cleanup and cold-context
binding still require runner integration and verification. Table comparator PASS
alone is not prerequisite PASS or proof of cold acceptance.

Fresh data-kind evidence is read from the newly opened Table filter UI's complete
local column store, bound to the same Table/node/execution. Dataset/RPC proxies
are not accessed. Decoded schema records `data_kind_source`; retained
configuration is explicitly marked `retained_configuration`, never fresh.
Only `imports.text` (`text_import_output_v1`) and verified Sliding CrossTable
receipts permit dynamic schema rereads; static handlers retain identity guards.
Original input node GUIDs/ports are checked against the owned graph before execute.

Full prerequisite acceptance still requires actual clean build, legacy CLI/cold,
Sliding and 3→6/6→6 metadata scenarios, recovery/save and native settings evidence.
Unit comparator PASS and administrative cleanup do not prove those requirements.

The cold settings adapter supports explicit `text-import-ui-v1`,
`grouping-ui-v1`, and `crosstable-ui-v1` read-only audits. It opens the owned saved
wizard, observes source/format/complete import definitions or complete processor
roles/options, cancels without configure/finish, then starts the fresh execution.
Record IDs and UI refs are not compared as persisted identities. Settings values
come from verified hot UI receipts and remain separate from independent expected
rows. Unknown settings kinds fail. Additional processor adapters belong to their
subsequent handler implementations.

`run-source-dynamics.sh <candidate> <new-out>` exercises the public original-S
route using the independent `fixtures/source-dynamics` CSV/expected definitions.
It checks 3→6 and 6→6 metadata, exact int64, payload/NULL, failure/correction,
save and versioned cold source/profile/schema readback. The fixture's numeric
expectations are authored independently, not copied from a Loginom result.

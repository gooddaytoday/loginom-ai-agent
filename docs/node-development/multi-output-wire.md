# Multi-output table oracle v1

`scripts/node-acceptance/multi-output-oracle.mjs` implements the explicit
`loginom-multi-output-v1` expected/observation table contract. It imports no
Loginom modules. `compare-output.mjs --expected ... --observation ... --output ...`
returns exit 0 only for comparator PASS, and exit 1 for comparator FAIL.

This is a partial implementation of the prerequisite. The cold runner and
scenario-set adapter do not yet produce this contract. Their legacy expected
format remains separate; existing node-plan specifications are not executable
inputs to this comparator. Live third-port checks belong to subsequent handlers.

Both documents carry `version`, `owner`, and `ports`. Owner has exact
`source_sha`, `package_path`, `workflow_id`, `node_id`. Expected ports contain
`index` (0–2), `role`, native `guid`, `schema`, `comparator`, `rules`, and `rows`.
Observation ports contain the same index/role/GUID/schema, `execution_id`,
`schema_source: "fresh_native"`, `filter_enabled: false`, `complete: true`,
`row_count`, and `rows`. Observation execution has `id`, `status: "completed"`,
`fresh: true`, `owner_verified: true`. Every port must share this execution ID.
The future native adapter must establish these claims from owned native evidence;
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

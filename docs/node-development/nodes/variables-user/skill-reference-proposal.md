Use the existing root scenario builtin `variables.user`, mode `values`,
target.kind `existing`; copy its NodeRef from the prepared graph.
Only user output 4 is writable. Inputs/mappings/read.ports are empty;
finish done or close. No target.label/position, links or Execute.

```json
{"variables":[{"name":"threshold","type":"real","value":0.15},{"name":"report_date","type":"datetime","value":"2026-10-31T00:00:00.000"}]}
```

Patch exact case-sensitive ASCII names. Preserve existing IDs/types/labels,
order and unmentioned values; new labels equal names. Never change an existing
type. Supported types: safe integer, finite binary64 real, boolean, string,
datetime. Real values are JSON numbers, not localized strings; never round
them to two decimals. Explicit null is NULL for every type, distinct from
zero, false and empty string. Empty string is valid only for string.

Datetime input is civil ISO YYYY-MM-DDTHH:mm:ss, optionally .000, without
timezone. Normalize a user's report date to midnight of that calendar day.
Nonzero input milliseconds, timezone suffixes, empty/invalid dates and
nonfinite reals refuse before editing; the native date editor can silently
drop fractions or replace an empty date with the current time. Do not use
string conversion or a guessed timezone to bypass that refusal.

Done commits settings without execution or package Save. The handler reopens
and checks its independent configuration.readback. Close cancels the draft.
Save separately with package.save_checkpoint, then call dock_node_read with
a NEW operation_id and source_operation_id from the successful values operation:

```json
{"operation_id":"read-user-1","source_operation_id":"values-1","read":{"ports":[],"variable_ports":[4]}}
```

Wait on the same operation. Inspect the complete typed variable inventory,
stable IDs, cell.is_null/value, count/completeness, fresh read_id and
execution_id null. Integer values are exact decimal strings; real values are
the stored finite binary64 number. Datetime readback uses local_datetime with
three millisecond digits and timezone unspecified: civil time, not an instant.
Saved dates may contain nonzero milliseconds even though input does not support
them; an untouched variable must retain them. Wizard snapshots do not prove
native OADate bytes and must not claim exact_native.

Snapshot opens the untouched VariablesEditValuesWizard and cancels it.
A dirty package refuses before opening: save and submit a NEW read operation.
Repeated inspection uses dock_node_read, not another values patch. A successful
snapshot can be the next source_operation_id. Cold verification reopens the
saved package and takes the same clean snapshot; Done alone proves no persistence.

For the report day and share threshold, bind the typed variables to an existing
table Calculator using its variable input and `Var.report_date` / `Var.threshold`.
Compute predicates there, then filter the resulting fields. Direct real/date
variable operands in Row Filter are outside its supported contract. After a
source patch reexecute the same consumers without rewriting formulas or values.
Do not copy variable values into consumer constants. Read both results afresh
and save. Executable variable nodes retain their Execute/VariablesForm contract.

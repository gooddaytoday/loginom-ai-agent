Use the existing “Переменные сценария” builtin in the root scenario. Observe the prepared graph. Build target.ref from its nodes[].node_id plus document_id and workflow_id issued by dock_prepare (the UI node_ref with a caption is a different legacy reference); never guess a GUID or create a new builtin. Only user output 4 is writable. Do not set target.label/position, add links, mappings, or use Execute.

Apply: type `variables.user`, mode `values`, target.kind `existing`, inputs `[]`, mappings `[]`, finish `done`, read.ports `[]`. Parameters:

```json
{"variables":[{"name":"limit","type":"integer","value":3},{"name":"skip","type":"integer","value":2}]}
```

A patch addresses exact case-sensitive ASCII names. Existing IDs, types, labels and unmentioned variables are preserved. New labels equal names. Types: safe integer, finite binary64 real, boolean, string, civil datetime; explicit JSON null is NULL, distinct from zero, false and empty string. No conversion of an existing type. Finish close cancels the draft. Done commits the values without execution or package Save; configuration.readback is independently reopened and checked.

For inspection, save this package with package.save_checkpoint, preserving its prepared workflow, then call dock_node_read using a NEW operation_id and source_operation_id from the successful values operation:

```json
{"operation_id":"read-user-1","source_operation_id":"values-1","read":{"ports":[],"variable_ports":[4]}}
```

Wait on that same operation. Read output.variable_ports[0]: complete typed variables with stable IDs, cell.is_null/value, count and completeness. Integer cell.value is an exact decimal string. Builtin source is snapshot, native_source VariablesEditValuesWizard, execution_id null and a new read_id. It opens only for reading and closes by Cancel; it never saves or executes. A dirty package refuses before opening: save, then submit a NEW read operation. Repeated inspection uses dock_node_read again, not another values patch. The same successful snapshot may be the next source_operation_id.

For updates send only the changed names, e.g. limit=5 and skip=10, finish done. Save before inspecting again. Verify all retained IDs/types and untouched values in the actual readback. Do not claim an execution ID, table result or persisted contents from Done alone. Cold verification reopens the saved package and takes the same clean snapshot. Executable variable nodes retain their separate Execute/VariablesForm read contract.

For scenario values (including a numeric threshold or report date), choose variables.user / values and parameters.variables, using the existing builtin. Use type real with a JSON number, e.g. 0.15 (decimal point; never a comma/string). Use type datetime with civil ISO YYYY-MM-DDTHH:mm:ss, optional .000, e.g. 2026-10-31T00:00:00. No timezone conversion. Nonzero input milliseconds, timezone suffixes, date-only/invalid dates and empty real/datetime refuse before UI. Explicit null creates a typed NULL; it never means current time or zero. Stored datetime reads retain milliseconds, real reads preserve binary64. For calculations depending on these variables use the existing table Calculator Var.name and its variable input, then filter computed flags; the Filter variable operand itself supports only integer/string. Patch only threshold/report_date to change those values; preserve consumers, all other values, IDs and labels.

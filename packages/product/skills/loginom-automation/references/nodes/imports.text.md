# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Existing Import: confirmed source CSV required before Execute/read; else ask.
Reads add a visualizer even after refusal. `NOT_APPLIED`/`effect_possible=false`:
report, ask for CSV; no cleanup baseline/Save.

Server preview: `dock_node_apply` `parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}` returns
`output.server_profile`, discarding without Execute. Set known
`settings.source.encoding`; garbled UTF-8 Cyrillic: refresh `dock_storage_source`,
retry `CP1251`. Partial preview proves no rare types. Reuse ref after download/sampling; a closed empty node needs full sample settings from the local profile.

Import output renames/types: edit SAME Import's `settings.columns`, no Reform.
"Do not reconfigure CSV loading": preserve `settings.source`/`settings.format`,
other fields/order; edit requested names/types/mappings only. Deliver this session's attachment with
`overwrite=reject`; compare server bytes before path reuse. Never bypass
`UPLOAD_PATH_CONFLICT` via path/policy changes, including saved-node activation.

New Import: omitted `source_path` uses upload_operation_id's path.
Defaults: UTF-8, header 1, skip 0, comma, decimal point, empty NULL, double quote;
explicit settings win. Set types/names.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл); no separate Import Execute.

## File list

Same-schema files: one `imports.text`; each needs delivery or fresh
`dock_storage_source`. `source.kind:"verified_sources"`, `sources` ordered by
`settings.source.source_paths`. `file_info:"name"` adds string FileName
outside CSV `columns` (`"none"` disables). No Calculator/JS. Keep node identity;
inspect all fields; Save separately.

Mask: `source_mask` in an owned directory, `*` only in filename; never `source_path(s)`.
Export/Save outside the mask directory. Each Execute: fresh `dock_storage_source` for ALL
matches (max 16); resend SAME `source_mask` with `verified_sources` on the SAME node.

Sequential/parallel: SAME Import, `dock_node_apply`,
`settings.source.parallel_processing:false/true`, `max_threads:"auto"|2|4|8|16|32`.
Enable parallel before threads. Lists/masks default sequential: resend parallel
explicitly with paths. Other omitted settings persist. No Calculator/JS.
Check `configuration.readback.source`, full row multisets/duplicates/NULL;
No order/speed guarantee.

## Auto-detected types

Data-driven types: `settings.format.auto_detect_columns` (`none`/`new`/`all`),
`settings.analysis`: `rows`, `refresh` (`all` — fields and types anew, `types` —
types only). A new node needs no `columns`: the schema is read; check `output`.
`all`: fields/types appear only after Execute; omit `columns`/output `mappings`.
For manual fields use `new`/`none`. `new`: manual types set in a separate call
on the SAME node survive `source_path` changes. `refresh` erases
manual types: only on request.

Mixed types: `settings.format.variant_as_general_type:true` and
`settings.analysis.refresh:"types"` on the same Import; no Calculator/JS. Use false
and refresh to redetect strings. Check values, types and NULL.

SAME Import caption: `settings.node_title:{mode:"automatic"}` follows basename;
`{mode:"custom",label:"Daily sales"}` persists across sources; omit preserves.
Check `configuration.readback.node_title`; no Calculator/JS.

## Path from variable

`binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0. First execute
`variables.to_table`/`columns` (source 4 → variables 0), `parameters:{}`,
`read:{ports:[0]}`. Never reopen UserVars values: Cancel deactivates. No Calculator/
JS/literal copy. Fresh `dock_storage_source` before EACH Execute/bound reread.
Configure verified `parameters.source`. Change only CsvPath; SAME Import,
`parameters:{settings:{}}`, `bindings:[]`, empty inputs/mappings, including after
Save/reopen. Check `configuration.bindings`.
<!-- /mode -->

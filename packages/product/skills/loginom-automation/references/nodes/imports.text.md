# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Existing Import: confirmed source CSV before Execute/read; else ask.
Reads add a visualizer even after refusal. `NOT_APPLIED`/`effect_possible=false`:
report/ask CSV; no cleanup baseline/Save.

Server preview: `dock_node_apply` `parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}` returns
`output.server_profile`; discard without Execute. Known
`settings.source.encoding`; garbled UTF-8 Cyrillic: refresh `dock_storage_source`,
retry `CP1251`. Preview proves no rare types. Reuse ref after download/sampling;
closed empty node: full sample settings from local profile.

Import output renames/types: edit SAME Import's `settings.columns`, no Reform.
"Do not reconfigure CSV loading": keep `settings.source`/`settings.format`/`mappings`,
fields/order; edit requested fields only. Deliver this session's attachment with
`overwrite=reject`; compare server bytes before path reuse. Never bypass
`UPLOAD_PATH_CONFLICT` via path/policy changes or saved-node activation.

New Import: omitted `source_path` uses upload_operation_id's path.
Defaults: UTF-8, header 1, skip 0, comma, decimal point, empty NULL, double quote.
Set types/names.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл); no separate Import Execute.

## File list

Same-schema files: one `imports.text`; each needs delivery or fresh
storage ref (`dock_storage_list`). `source.kind:"verified_sources"`, `sources` ordered by
`settings.source.source_paths`. `settings.source.file_info`:
`name`/`relative_path`/`absolute_path` adds string FileName; suffix `_time` adds
datetime FileTime (`none` disables). Outside CSV `columns`.
Relative: only beside saved package. SAME Import; no Calculator/JS.
Check readback; Save. FileTime: non-NULL, not local mtime.

Mask: `source_mask` in an owned directory, `*` only in filename; never `source_path(s)`.
Export/Save outside the mask directory. 1 file: plain path; 2+ (max 16): mask.
Execute: resend `source_mask` + `verified_sources` of ALL on SAME node.

Sequential/parallel: SAME Import; no Calculator/JS.
`dock_node_apply`,
`settings.source.parallel_processing:false/true`, `max_threads:"auto"|2|4|8|16|32`.
Enable parallel before threads. Lists/masks default sequential: resend parallel
with paths. Omissions persist.
Check `configuration.readback.source`, full row multisets/duplicates/NULL;
No order/speed guarantee.

## Auto-detected types

Types: `settings.format.auto_detect_columns` (`none`/`new`/`all`),
`settings.analysis`: `rows`, `refresh` (`all` — fields and types anew, `types` —
types only). New node: omit `columns`; check `output` schema.
`all`: fields/types appear only after Execute; omit `columns`/output `mappings`.
For manual fields use `new`/`none`. `new`: manual types set in a separate call
on the SAME node survive `source_path` changes. `refresh` erases
manual types: only on request.

Mixed types: `settings.format.variant_as_general_type:true` and
`settings.analysis.refresh:"types"` on the same Import; no Calculator/JS. Use false
and refresh to redetect strings. Check values/types/NULL.

SAME Import caption: `settings.node_title:{mode:"automatic"}` follows basename;
`{mode:"custom",label:"Sales"}` persists across sources; omit preserves.
Check `configuration.readback.node_title`.

## Path from variable

`binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0. First execute
`variables.to_table`/`columns` (source 4 → variables 0), `parameters:{}`,
`read:{ports:[0]}`. Never reopen UserVars values: Cancel deactivates. No Calculator/
JS/literal copy. Fresh `dock_storage_source` before EACH Execute/bound reread.
Bind with verified `parameters.source`. Rerun (new CsvPath, Save/reopen): SAME
Import, `parameters:{settings:{}}` WITHOUT `source`, `bindings:[]`, no
inputs/mappings. Check `configuration.bindings`.
<!-- /mode -->

# Text file (`imports.text`)

<!-- mode: delimited -->
Existing: confirmed source CSV before Execute/read; else ask.
Reads add a visualizer on refusal too. `NOT_APPLIED`/`effect_possible=false`:
ask CSV; no cleanup baseline/Save.

Preview FIRST; compare ORIGINAL text.
`dock_node_apply`: storage source + settings.source.source_path, preview_only:true,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}`:
`output.server_profile`: format/types, no Execute. `settings.source.encoding`;
garbled: fresh `dock_storage_source`, `CP1251`. No rare types proof.
Reuse after download/sampling with full sample settings.

After preview: SAME Import, full settings/source_path. Unique columns; add schema data_kind:
```json
{"name":"Id","label":"Id","type":"integer","used":true}
```

Import output renames/types: edit SAME Import's `settings.columns`, no Reform.
CSV loading unchanged: keep `settings.source`/`settings.format`/`mappings`,
fields/order; edit requested fields only. This session's attachment:
`overwrite=reject`; compare server bytes before path reuse. Never bypass
`UPLOAD_PATH_CONFLICT` via path/policy changes or saved-node activation.

New: omitted `source_path`=upload_operation_id's path.
Defaults: UTF-8/header 1/skip 0/comma/decimal point/empty NULL/double quote.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл); no separate Import Execute.

## File list

Same schema: one `imports.text`; each: delivery or fresh
storage ref (`dock_storage_list`). `source.kind:"verified_sources"`, `sources` ordered by
`settings.source.source_paths`. `settings.source.file_info`:
`name`/`relative_path`/`absolute_path` adds string FileName; suffix `_time` adds
datetime FileTime (`none` disables). Outside CSV `columns`.
Relative: beside saved package. SAME Import; no Calculator/JS.
Check readback; Save. FileTime: non-NULL, not local mtime.

Mask: `source_mask` in an owned directory, `*` only in filename; never `source_path(s)`.
Export/Save outside the mask directory. 1 file: plain path; 2+ (max 16): mask.
Execute: resend `source_mask` + `verified_sources` of ALL on SAME node.

Parallel: SAME Import; no Calculator/JS.
`dock_node_apply`,
`settings.source.parallel_processing:false/true`, `max_threads:"auto"|2|4|8|16|32`.
Enable parallel before threads. Lists/masks default sequential: resend parallel
with paths. Omissions persist.
Check `configuration.readback.source`, full row multisets/duplicates/NULL;
No order/speed guarantee.

## Auto-detected types

User types win. Fix only sample contradictions: leading-zero IDs → string;
wrong decimals → correct; date strings/NULL → `date_format`/`date_separator`.
dd.MM/dd/MM → `dd/mm/yyyy`, . or /; ISO → `yyyy/mm/dd`, -.
Ambiguous dates: user convention/ask.
Single-file spaced decimal amounts default real. Temporary Import string →
Calculator `Val(Replace(Field," ","",True))`, same name; local decimal, NULL.
Before Export/report: read Calculator output, verify real/values/NULL.
Report types/date format; check seconds.

Types: `settings.format.auto_detect_columns` (`none`/`new`/`all`),
`settings.analysis`: `rows`, `refresh` (`all`=fields/types, `types`=types).
`new`: omit `columns` unless correcting. Reuse node: complete source/format.
`all`: fields/types appear only after Execute; omit `columns`/output `mappings`.
For manual fields use `new`/`none`. `new` preserves separate-call manual types on SAME node across `source_path` changes. `refresh` erases manual types: only on request.

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

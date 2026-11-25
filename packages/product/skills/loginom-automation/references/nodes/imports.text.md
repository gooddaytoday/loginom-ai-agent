# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Existing needs confirmed source CSV before Execute/read.
Reads may add a visualizer. `NOT_APPLIED`/`effect_possible=false`: ask CSV, skip cleanup/Save.

Missing CSV: `next_step`; SAME node, no XML.

Execute with known schema/format. Otherwise preview and compare ORIGINAL text locally.
Server download only by request or contradiction. User bans win.
`dock_node_apply` `parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}`:
`output.server_profile`: native format/types, no Execute. Reuse `node` as `target.ref` after Close.
If garbled, fresh `dock_storage_source` and `settings.source.encoding` CP1251.
`columns_omitted>0`: do NOT ask names. `auto_detect_columns:"new"`, omit `columns`;
Execute; ALL names/types/N from readback/port. Edits: SAME node.
Report native types. Leave rare types unchecked. download/sampling: full sample settings.

Rename/type edits: SAME Import's `settings.columns`, no Reform.
Keep unchanged `settings.source`/`settings.format`/`mappings` and field order.
Attachment `overwrite=reject`. Compare server bytes before reuse. Never bypass
`UPLOAD_PATH_CONFLICT` via path/policy or saved-node activation.

Use receipt `output.upload_operation_id`. Omit `source_path` for its verified path.
Fallback: UTF-8, header 1, skip 0, comma, decimal point, empty NULL, double quote.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл); no separate Import Execute.

## File list

Same-schema: one Import; each needs delivery/fresh
ref (`dock_storage_list`). `source.kind:"verified_sources"`; order `sources` by
`settings.source.source_paths`. `settings.source.file_info`:
`name`/`relative_path`/`absolute_path` adds string FileName; suffix `_time` adds
datetime FileTime (`none` disables). Outside CSV `columns`.
Relative: beside saved package.
Readback; Save. FileTime: non-NULL, not local mtime.

Mask: `source_mask` in an owned directory, `*` only in filename; never `source_path(s)`.
Export/Save outside the mask directory. 1 file: plain path; 2+ (max 16): mask.
Execute: resend `source_mask` + `verified_sources` of ALL on SAME node.

Parallel: SAME Import; `dock_node_apply`,
`settings.source.parallel_processing:false/true`, `max_threads:"auto"|2|4|8|16|32`.
Parallel before threads; lists/masks default sequential. Resend parallel with paths; omissions persist.
Read `configuration.readback.source`, full row multisets/duplicates/NULL;
Order/speed unguaranteed.

## Auto-detected types

User types win. Fix contradictions only: leading-zero IDs → string;
wrong decimals → correct; date strings/NULL → `date_format`/`date_separator`.
dd.MM/dd/MM → `dd/mm/yyyy`, . or /; ISO → `yyyy/mm/dd`, -.
Ambiguous dates: user convention/ask.
Single-file spaced decimal amounts default real. Temporary Import string →
Calculator `Val(Replace(Field," ","",True))`, same name; local decimal, NULL.
Before Export/report read Calculator real/values/NULL; types/date format/seconds.

Types: `settings.format.auto_detect_columns` (`none`/`new`/`all`),
`settings.analysis`: `rows`, `refresh` (`all`=fields/types, `types`=types).
`new`: omit `columns` unless correcting. Reuse: complete source/format.
`all`: fields/types appear only after Execute; omit `columns`/output `mappings`.
For manual fields use `new`/`none`. `new`: separate-call types on SAME node survive
`source_path` changes. `refresh` erases manual types: only on request.

Mixed: `settings.format.variant_as_general_type:true` and
`settings.analysis.refresh:"types"` on SAME Import; no Calculator/JS. Use false
and refresh to redetect strings. Check values/types/NULL.

New: pass the caption in `target.label`. `settings.node_title` overrides it
(automatic uses basename). Verify `configuration.readback.node_title`.

## Path from variable

`binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0. Execute
`variables.to_table`/`columns` (source 4 → variables 0), `parameters:{}`,
`read:{ports:[0]}`. No UserVars values reopening: Cancel deactivates. No Calculator/
JS/literal copy. Fresh `dock_storage_source` before EACH Execute/bound reread.
Bind with verified `parameters.source`. Rerun (new CsvPath, Save/reopen): SAME
Import, `parameters:{settings:{}}` WITHOUT `source`, `bindings:[]`, no
inputs/mappings. Check `configuration.bindings`.
<!-- /mode -->

# Текстовый файл

<!-- mode: delimited -->
Existing: confirmed source CSV for Execute/read (may add visualizer).
`NOT_APPLIED`/`effect_possible=false`: ask CSV; skip cleanup/Save.
Missing: `next_step`; SAME node, no XML.

Confirmed types/header/encoding/format: first Apply copies
`settings.source` without the profile's `source_path`, full `settings.format`
(`null_marker` incl. `""`), whole `settings.columns` incl. `label`. Execute/read port 0.
Profile: `status:"sampled"` or `scan.status:"exact"`, empty `anomalies`,
no mismatches. Verify defaults.
Else preview and compare ORIGINAL text.

Server download by request/contradiction only; respect bans.
Server preview: `parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}`:
`output.server_profile`: native format/types, no Execute. Reuse `node` as `target.ref`.
If garbled: fresh `dock_storage_source`; `settings.source.encoding`=CP1251.
`columns_omitted>0`: don't ask names. `auto_detect_columns:"new"`, omit `columns`;
Execute; report all native names/types/N from port/readback.
Keep rare types unchecked. download/sampling: full sample settings.

Rename/types: SAME Import's `settings.columns`, no Reform.
Keep `settings.source`/`settings.format`/`mappings` and field order.
Attachment `overwrite=reject`; compare server bytes before reuse.
No path/policy/saved-node activation bypass of `UPLOAD_PATH_CONFLICT`.

Verified delivery: use `output.upload_operation_id`.
Fallback: UTF-8, header, skip 0, comma, dot, empty NULL, double quote.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл); no separate Import Execute.

## File list

Same schema: one Import with delivery/fresh ref (`dock_storage_list`).
`source.kind:"verified_sources"`; `sources` in `settings.source.source_paths` order.
`settings.source.file_info`: `name`/`relative_path`/`absolute_path` → string FileName;
`_time` suffix adds datetime FileTime (`none` disables). Outside CSV `columns`.
Relative to saved package. FileTime non-NULL, not local mtime.

`source_mask`: owned directory, `*` only in filename; never `source_path(s)`.
Requested Export/Save goes outside the mask directory. 1 file: path; 2+ (max 16): mask.
Execute: resend `source_mask` + `verified_sources` of ALL on SAME node.

SAME Import: `settings.source.parallel_processing:false/true`, `max_threads:"auto"|2|4|8|16|32`.
Parallel before threads; lists/masks default sequential. Resend parallel with paths; omissions persist.
Read `configuration.readback.source`, full row multisets/duplicates/NULL. Order/speed unguaranteed.

## Auto-detected types

User types win. Fix contradictions only: leading-zero IDs → string; correct decimals;
date strings/NULL → `date_format`/`date_separator`.
dd.MM/dd/MM → `dd/mm/yyyy`, . or /; ISO → `yyyy/mm/dd`, -. Ambiguous: user convention/ask.
Single-file spaced decimals default real. Interim string →
Calculator `Val(Replace(Field," ","",True))`, same name; local decimal, NULL.
Before Export/report read Calculator real/values/NULL, types/date format/seconds.

`settings.format.auto_detect_columns`: `none`/`new`/`all`.
`settings.analysis`: `rows`, `refresh` (`all`=fields/types, `types`=types).
`new`: omit `columns` for auto-detect. Reuse full source/format.
`all`: fields/types appear only after Execute; omit `columns`/output `mappings`.
For manual fields use `new`/`none`. `new`: SAME-node type edits survive `source_path` changes.
`refresh` erases manual types; only on request.

Mixed: `settings.format.variant_as_general_type:true` + `settings.analysis.refresh:"types"`
on SAME Import; no Calculator/JS. False + refresh to redetect strings. Check values/types/NULL.

Caption: `target.label`. `settings.node_title` overrides (auto: basename).
Verify `configuration.readback.node_title`.

## Path from variable

`binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0. Execute
`variables.to_table`/`columns` (source 4 → variables 0), `parameters:{}`, `read:{ports:[0]}`.
No UserVars values reopening: Cancel deactivates. No Calculator/JS/literal copy.
Fresh `dock_storage_source` before EACH Execute/bound reread.
Bind verified `parameters.source`. Rerun (new CsvPath, Save/reopen): SAME
Import, `parameters:{settings:{}}` WITHOUT `source`, `bindings:[]`, no
inputs/mappings. Check `configuration.bindings`.
<!-- /mode -->

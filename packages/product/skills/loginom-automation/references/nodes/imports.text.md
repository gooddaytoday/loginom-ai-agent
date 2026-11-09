# Текстовый файл (`imports.text`)

<!-- mode: delimited -->
Before changing an existing Import, get the confirmed source CSV. Without it ask
for the file before Execute/read: a read adds a visualizer table to the package
even if configuration is refused. After `NOT_APPLIED` with `effect_possible=false`
do no baseline/Save for cleanup: report the refusal and ask for the CSV.

Server text preview: `dock_node_apply` for `imports.text`,
`parameters:{source:{kind:"storage",server_source_ref:"…"},preview_only:true,settings:{source:{source_path:"…"}}}`,
`finish:"close"`, `inputs:[]`, `mappings:[]`, `read:{ports:[]}` returns
`output.server_profile` and closes the draft without Execute. Set known
`settings.source.encoding`, e.g. `CP1251`; if UTF-8 mangles Cyrillic, refresh
`dock_storage_source` and retry `CP1251`; mojibake is not file data. Preview may
be partial: it proves no rare types. Reuse the ref after download/sampling; a
closed empty node needs full sample Import settings from the local profile.

If the prepared table is a text Import's direct output and only field
renames/types are needed, change that Import's `settings.columns`; add no Reform.
"Do not reconfigure CSV loading" means keep `settings.source`, `settings.format`,
other fields and order; change requested names/types and needed output mappings
on the same Import. Deliver this session's original attachment with
`overwrite=reject`: reuse a path only after comparing server bytes. On
`UPLOAD_PATH_CONFLICT` never change path or overwrite policy to bypass it, even
to activate a saved node.

In a new Import after delivery `source_path` may be omitted: Dock takes it from
upload_operation_id. Defaults: UTF-8, header in line 1, skip 0, comma, decimal
point, empty NULL, double quote; explicit values are kept. You set column types
and names.

`source_switch`: [switch to full file](../large-files.md#переключение-на-полный-файл);
no separate Import Execute.

## Auto-detected types

Data-driven types: `settings.format.auto_detect_columns` (`none`/`new`/`all`),
`settings.analysis`: `rows`, `refresh` (`all` — fields and types anew, `types` —
types only). A new node needs no `columns`: the schema is read; check `output`.
`all`: fields appear only after Execute, Loginom sets types; pass no `columns` or
output `mappings`; to control fields use `new`/`none`. `new`: manual types (a
separate call on the same node) survive a `source_path` change. `refresh` erases
manual types: only on request.

## Path from variable

Use `binding_schema`; `variable_inputs`: `variables.user` 4 → Import 0. First
execute `variables.to_table`/`columns` (source 4 → variables 0), `parameters:{}`,
`read:{ports:[0]}`. Never reopen UserVars values: Cancel deactivates. No
Calculator/JS or literal copy. Fresh `dock_storage_source` before EACH Execute
and bound Import reread. Configure with verified `parameters.source`. Change only
CsvPath; same Import with `parameters:{settings:{}}`, `bindings:[]`, empty
inputs/mappings, also after Save/reopen. Check `configuration.bindings`.
<!-- /mode -->

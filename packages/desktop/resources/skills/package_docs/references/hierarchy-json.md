# Hierarchy JSON (extractor → narrative)

`structure.json` modules expose `hierarchy[]` close to tools-loginom AI Report.

## Edge shape

Each item:

```json
{ "Source": "<token>|null", "Target": "<token>|null" }
```

Token format:

```text
<label>:<service_name>:<guid>
```

Semantics:

| Case | Meaning |
|---|---|
| `Source` is null | `Target` is an initial / entry node |
| `Target` is null | `Source` is a terminal / exit node |
| both set | directed data/service link |

- `label` — user-facing node name on the canvas.
- `service_name` — operational essence (e.g. `ImportNative`, `CalcData`, `Подмодель`).
- `guid` — uniqueness only; **never** print GUIDs in the report prose.

## Nesting

- Nodes with service name `Подмодель` contain nested workflows.
- Extractor expands nested facts up to `max_depth=2` under `modules[].submodels[]`.
- Nested modules also have their own `hierarchy`, `notes`, `workflow_nodes`, `links`.

Readable links (for agent context, not for dumping into MD) live in
`modules[].links[].readable`, e.g. `Источник.DataSet → Калькулятор.DataSource`.

## Notes

`modules[].notes[]` (and nested submodel notes) are free-text annotations from
the workflow. Prefer them when they explain business intent.

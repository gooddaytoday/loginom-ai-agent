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
| `Source` is null | `Target` has no incoming link at this level |
| `Target` is null | `Source` has no outgoing link at this level |
| both set | directed data/service link |

- `label` — user-facing node name on the canvas.
- `service_name` — operational essence (e.g. `ImportNative`, `CalcData`, `Подмодель`).
- `guid` — uniqueness only; **never** print GUIDs in the report prose.

Null здесь описывает положение узла в графе, а не входной или выходной порт
подмодели. Изолированный узел встречается и как начальный, и как конечный;
это не подтверждает источник данных, передачу результата или работающий поток.

## Nesting

- Nodes with service name `Подмодель` contain nested workflows.
- Extractor recursively expands all nested facts under `modules[].submodels[]`.
- Nested modules also have their own `hierarchy`, `notes`, `workflow_nodes`, `links`.

Внешние порты подмодели находятся в узле с тем же `guid` в
`workflow_nodes` её родителя: `input_ports`, `output_ports` и служебные порты.
Её внутренний `workflow_nodes` описывает вложенные узлы. Связь с другими узлами
родителя подтверждает только соответствующий `links`, внутреннюю связь —
`links` самой подмодели. Пустые порты или links не заполняй по назначению типа.

Readable links (for agent context, not for dumping into MD) live in
`modules[].links[].readable`, e.g. `Источник.DataSet → Калькулятор.DataSource`.

## Notes

`modules[].notes[]` (and nested submodel notes) are free-text annotations from
the workflow. Prefer them when they explain business intent.

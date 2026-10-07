# Narrative prompts (adapted from tools-loginom AI Report)

Use these instructions when filling `PLACEHOLDER_*` in the skeleton.
Answer **only in Russian**. Do not invent package facts that contradict
`structure.json`. Help blurbs may explain node capabilities, not `.lgp` internals.
Не превращай общую возможность обработчика в факт его настройки. При пустых
настройках неизвестны формулы и код; при отсутствии портов или связей нельзя
утверждать передачу данных через них. Пустой `external_references` не означает
отсутствие файловых зависимостей: импорт `data.lgd` требует этого файла.

## Package description (`PLACEHOLDER_PACKAGE_DESCRIPTION`)

System intent:

> You create a package description based on a summary of the scenarios
> contained in this package.

User intent:

> Analyze the summary about the scenarios in the package (module titles,
> notes, top-level flow). Write a description for a business audience.
> Keep it within ~200 tokens. Russian only.

Place the result as a blockquote under `### Описание пакета`.

## Module description (`PLACEHOLDER_MODULE_<N>_DESCRIPTION`)

System intent:

> You create descriptions for analytical scenarios from the hierarchy of
> connections between handler nodes.

Hierarchy rules (also in `hierarchy-json.md`):

1. Keys `Source` / `Target`.
2. `Source = null` → `Target` is initial.
3. `Target = null` → `Source` is terminal.
4. Value shape: `label:service_name:guid`.
5. Label is the user name; service name is operational essence.
6. GUID is for uniqueness only — omit from prose.
7. Nested structures use service name `Подмодель`.

User intent:

> Analyze `hierarchy` and `notes` for the module. Optionally use Help blurbs
> for node types. Describe the scenario: first overall prose, then
> **Общая структура**, then **Описание подмоделей** (вход → расчёт/обработка →
> выход) when logic is distributed across submodels. If there are no
> submodels, give a concise flow based on node roles and links.
> Keep within ~400 tokens. Concise and concrete. Russian only. No GUIDs.

## Forbidden in final MD

- English-only paragraphs
- GUID strings
- Help source lists (`Источники:`)
- Full node tables / settings dumps

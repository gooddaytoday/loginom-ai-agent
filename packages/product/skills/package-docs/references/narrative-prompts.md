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

Название вроде «Демо» и набор типов узлов не устанавливают бизнес-задачу.
Если она не указана в названиях/заметках, напиши «Бизнес-назначение пакета
не указано», затем опиши подтверждённый состав и связи. Не приписывай автору
учебную цель или ожидаемый бизнес-результат по одному наличию обработчиков.
Это правило действует и для описания модуля: не называй сценарий
«демонстрационным», «учебным» или «тестовым» только по имени «Демо».
Фраза «Бизнес-назначение не указано» не разрешает такое утверждение следом.
Для этого случая достаточно: «Пакет содержит модуль „Демо“. Источник настроен
на импорт из `data.lgd` и связан с Калькулятором; формулы Калькулятора
не указаны. Отдельная подмодель содержит Python и ещё одну подмодель».

Place the result as a blockquote under `### Описание пакета`.

## Module description (`PLACEHOLDER_MODULE_<N>_DESCRIPTION`)

System intent:

> You create descriptions for analytical scenarios from the hierarchy of
> connections between handler nodes.

Hierarchy rules (also in `hierarchy-json.md`):

1. Keys `Source` / `Target`.
2. `Source = null` → у `Target` нет входящего ребра на этом уровне.
3. `Target = null` → у `Source` нет исходящего ребра на этом уровне.
4. Value shape: `label:service_name:guid`.
5. Label is the user name; service name is operational essence.
6. GUID is for uniqueness only — omit from prose.
7. Nested structures use service name `Подмодель`.
8. Отсутствие ребра не доказывает наличие внешнего порта или передачи данных.

User intent:

> Analyze `hierarchy` and `notes` for the module. Optionally use Help blurbs
> for node types. Describe the scenario: first overall prose, then
> **Общая структура**, then **Описание подмоделей** (вход → расчёт/обработка →
> выход) when logic is distributed across submodels. If there are no
> submodels, give a concise flow based on node roles and links.
> Keep within ~400 tokens. Concise and concrete. Russian only. No GUIDs.

Каждую раскрытую подмодель, включая вложенную в другую, опиши отдельно.
«Вход → обработка → выход» — вопросы к фактам, а не обязательный готовый поток.
Например, при пустых внешних портах корректно: «Входные порты не заданы» и
«Выходные порты не заданы; передача результата не определена». Некорректно:
«Данные поступают через порты (порты не заданы)». При пустых внутренних links
напиши, что связи между вложенными узлами не заданы. Если код, формулы или
цель узла-ссылки не указаны в извлечённых настройках, обозначь это как
неизвестное; Help не восстанавливает конкретную настройку пакета.

## Forbidden in final MD

- English-only paragraphs
- GUID strings
- Help source lists (`Источники:`)
- Full node tables / settings dumps

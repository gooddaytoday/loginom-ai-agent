# Предложение знаний Fetch / FS (до утверждения)

Тексты ниже не установлены в product skill. После принятия соответствующего
среза добавлять только подтверждённые возможности. FS запись нельзя объявить
поддержанной вместе с одним чтением. Не увеличивать лимиты модели.

Предлагаемая замена ровно одной строки маршрутизации в SKILL.md:

```text
| JS, Fetch or FS | `programming.javascript` / script | [reference](references/nodes/programming.javascript.md) |
```

Предлагаемый добавляемый текст в reference узла (после реализации всех срезов):

```text
Fetch/FS on Loginom 7.4.2: use only supported builtIn/Data, builtIn/Fetch and builtIn/FS imports. Read the complete effective source before changing or executing existing code. External modules, dynamic import and require remain refused.
Fetch sources can have no table input. Define output columns in code and put await inside an async function. Check response.ok/status before parsing JSON. A caught error must produce explicit user-requested diagnostics; console.error is not proof of success. Never infer completion from a green icon. AbortController with a cleared timer bounds a request; request abort does not cancel remote work.
FS uses the synchronous Loginom storage API, not Node fs or browser files. Use only explicitly assigned own storage paths. Relative paths resolve from the saved package directory, or the personal directory before Save. Sidecar files must be delivered and preserved separately. Verify exact text encoding and binary bytes after cold reopen. Do not retry unknown HTTP/FS effects automatically or infer that Done/Next cannot execute source.
```

Предлагаемая добавка к описанию source_text в карточке типа:

```text
Fetch/FS: only validated Loginom built-ins; no-input sources require the confirmed JS zero-input path. Use async functions, explicit HTTP status checks and bounded abort. FS paths belong to assigned storage. Save does not prove bundled sidecars. Unknown external effects must not be retried automatically.
```

Замерить UTF-8 содержимое трёх fenced text-блоков без newline после последней
строки; для вставки в конец reference добавить два LF перед текстом и один после.
Для карточки ниже считается только добавление пробела и последнего блока в
существующую строку description, при неизменной остальной схеме. Это оценка
текста, а не реальный новый контракт handler. Настоящую карточку после реализации
измерить тем же `test/model-schema-budget.test.mjs`.

| Объект | База, Б | Оценка с этим текстом, Б | Лимит, Б |
|---|---:|---:|---:|
| compact apply | 13 331 | 13 331 (схема в оценке не меняется) | 20 000 |
| full input schema | 53 748 | 53 748 | нет |
| карточка JS | 16 318 | 16 624 | 12 000 |
| SKILL.md | 38 215 | 38 172 | 40 000 |
| строка маршрутизации | 156 | 113 | около 200 |
| reference узла | 1 769 | 2 846 | 6 000 |

Расчётное превышение карточки после текстовой добавки —
4 624 Б. Этап 1 должен уменьшить её до 12 000 Б,
сохранив действующие ограничения, затем измерить фактический wire reply.
Никакого повышения бюджета это предложение не разрешает.

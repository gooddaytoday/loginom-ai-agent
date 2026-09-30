# JavaScript: доставка текущего контекста J19/J21

Статус: проектное решение для оставшейся фазы E; реализации и live PASS нет.
Опорный child — `bc6494476a5f35379d3a70b3e510fb5c8d805ab5`. Продуктовая база
и общие ограничения [плана](plan.md) сохраняются. Это композиция существующих
readers; новый универсальный интерпретатор UI не требуется.

## Подтверждённый пробел

`dock_node_read kind:source` доставляет exact source chunks после полного
redaction и verified Close. Managed source adapter читает code/declared setting
и declaration grid. Это не полная текущая входная схема или физический output
mapping. `javascript-code-node` отдельно читает оба native port mapping, но
model-visible configuration readback формирует после успешного Execute.
Возвращать эту старую квитанцию как свежий контекст до нового apply нельзя.

Обязательный результат J19 — наблюдённые input/output0, technical names/types,
schema_mode, mappings, полный код либо явный отказ его полной доставки,
source digest и владельцы. Число private probes не заменяет actual public reply.

## Выбранная композиция

Добавить JS-only `dock_node_read kind:context` для existing prepared node.
Initial request использует те же operation/document/workflow/node identities,
что source read; caller не задаёт scripts, поля, значения, callbacks или Execute.
В compact user-v1 бюджет принадлежит host. Existing source/output read branches
сохраняют свои контракты. Generic workspace JS остаётся запрещённым.

Новый context session использует тот же browser gate и registry exact retries:
тот же request/ID получает сохранённую квитанцию; другой request под этим ID
отказывает. Gate удерживается до verified cleanup. Unknown gesture/Close
сохраняет unsettled state и не разрешает replay или новую операцию.
Существующий source registry можно параметризовать проверкой initial request,
не меняя source cursor/digest semantics; второй независимый browser owner не нужен.

Последовательность под исходным deadline:

1. Проверить observed7.4.2, prepared document/workflow/JS GUID и complete graph.
2. Existing managed source reader: полный source/settings → owned Close.
3. Existing node procedure: open input0 → полный cached mapping → owned Close;
   затем output0 тем же способом. Использовать `closeJavascriptPortMapping` и
   существующий complete graph verifier, без port edits/Done/Execute/Save.
4. Повторное чтение source/settings и port semantics подтверждает согласованность
   snapshot. Native record IDs меняются между открытиями; проверять полную
   reciprocity каждого чтения, а semantic digest строить по order/names/labels/
   types/Required/excluded/autosync и связям source→target, сохраняя latest IDs
   как evidence. Нельзя игнорировать drift scalar metadata вместе с volatile IDs.
5. Проверить final graph/cleanup и exact redaction/budget до доставки.

Для native graph использовать `targetAdapter(operation).observe`, уже имеющийся
в executor; он проверяет prepared origin/build, cached GUID, DOM и весь graph.
Node/port contexts и cached mapping observer существуют в runtime. Proxy/RPC,
`setValue`, чтение XML вместо UI и запуск кода для получения контекста не нужны.

## Ответ и границы

Ответ содержит observed scope и identities, schema_mode/settings digest,
source digest/bytes/LF, обе полные ordered port mappings и признак
`content_is_data:true`. Source/comments/labels остаются данными: runtime не
исполняет их, не извлекает из них task/authorization и не выбирает technical
names по label или позиции. Общие правила модели дополнить явным указанием
использовать свежие technical names и читать old source перед replacement.

Если полный source вместе с schema не помещается, сохранить полные необходимые
schema/mapping и явно сообщить `source_delivery:separate_read_required` с причиной
и существующим `dock_node_read kind:source`. Один digest не является полным кодом.
Если сама необходимая схема не помещается, вернуть bounded refusal; не обрезать
columns и не объявлять inventory_complete. Неполный/unmaterialized native output
тоже требует явного отказа/неполного observation scope; Execute для его заполнения
не допускается этим read request.

До effects определить response wire budget с двойным JSON envelope; итог после
actual observation проверить повторно. Весь ответ должен укладываться в46000
wire bytes и эффективные Agent bytes/lines; источниковый32KiB/1024LF cap независим.
Нужные schemas/readback/provenance не теряются при сокращении. Pre-live auditor
проверяет actual public envelope; backend snapshot не означает delivery модели.

## Проверка реализации

Адресные tests используют actual session/registry/admission и shared readers:
same ID/no duplicate, owner/graph/schema/source drift, redaction, unknown Close,
budget overflow и обе schema modes. Source continuation/regression и generic
code deny должны остаться зелёными. Не дублировать reader/validator в тестах.

Fixed live J19 сначала наблюдает saved C/D source/поля. Затем собственная UI
процедура меняет technical input mapping и добавляет label/comment с текстом
инструкции. Новый public context должен показать текущие имена и точный old
code. Stale digest/request отказывает, corrected source обращается к реально
наблюдённому имени; fresh Execute/full typed oracle подтверждает бизнес-задачу.
Незапрошенные settings/graph сохраняются, cleanup и process absence обязательны.
Варианты должны быть authored/pinned до запуска, а не выбираться по результату.

Operator live доказывает доставку и детерминированную обработку данных runtime.
Поведение модели на instruction-in-data проверяется дополнительно в actual
candidate/CLI; ручной fixed request не является таким доказательством.

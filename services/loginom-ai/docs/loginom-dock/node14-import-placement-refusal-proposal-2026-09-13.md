# Предложение координатору: терминальный отказ размещения текстового импорта

Статус: **предложение, не реализация и не допуск**. Общий аудитор не изменён.
Источник: immutable FAIL `20260913-132939-0384fe0b`, source83dc0db5,
runtime bdddbd1b, manifest test4.2/cadd80df.

Подтверждённый пример: `import-one120` запрашивал (80,880) относительно графа
(324,100,1178,756), то есть экранную точку (404,980) при viewport1508×862.
Три native попытки дали структурированный unreachable_drop_surface/NOT_APPLIED,
effect=false/cleanup=true; последующий `import-one120b` в (300,80) SUCCEEDED.
Нормализованные запросы совпали после удаления только operation_id и position.

Предлагается отдельный классификатор **только imports.text / delimited / new**,
который не меняет результат отказа NOT_APPLIED и не считает его успехом.
Он должен доказать одновременно:

1. Ровно по одному prepared/node_apply_prepared/completed с одинаковыми
   session/runtime/manifest/document/workflow/signature. Полный журнал без
   удаления вызовов, ошибок, попыток и квитанций; уникальность всех ID.
2. Source phase: проверенная связь artifact_id/upload_operation_id с фактической
   upload/verification квитанцией, exact bytes/SHA/destination и overwrite grant.
   Не принимать только путь, текст ошибки или флаг verified без исходной цепочки.
   Source здесь — CSV, а не действующий узел: не применять Missing Values preflight.
3. Workflow phase: наблюдался исходный document/workflow; для разрешения
   no-effect отказа обе фазы требуют cleanup=true/effect=false. Deactivation,
   activation, чужое переключение или неизвестный эффект исключают этот класс.
4. От одной до трёх create attempts, полный исходный граф и post-refusal граф
   совпадают по всем полям. Каждая попытка имеет точный effect.id/signature,
   NOT_APPLIED/effect=false/cleanup=true и фактическую геометрию unreachable.
   Нулевые target receipts, targetId=null, pending=null, completed=false.
   Нет настройки, mapping, открытия мастера, исполнения, сохранения либо
   восстановления после начала отказанного target. Любая недостающая квитанция
   или изменение узлов/портов/связей/идентичности закрывает допуск.
5. Итог строго NOT_APPLIED, общий и вложенный effect_possible=false,
   cleanup_complete=true, node=null, execution=not_requested,
   output=not_refreshed, pending_phase=null. В отличие от Missing Values
   здесь нельзя переносить исключение известного эффекта источника.
6. Один успешный преемник с новым operation_id. Изменены только ID/координаты;
   тот же CSV/grant/schema/format/mapping/finish/read/budget/label. Преемник
   начинается после durable completed и доставки терминального публичного
   ответа. Тот же ID с изменёнными параметрами не является преемником.
7. Все пары call/result и user-v1 projection точны. Inspect — только с
   независимо подтверждённым settled/resolved исходом и cleanup, исходным
   NOT_APPLIED и matching verification_delivered. Resume/cancel/recover,
   частичные эффекты и произвольные дополнительные вызовы не разрешаются.
8. После partition остаются ровно27 успешных операций,9 импортов,12 финальных
   результатов, полный native save и независимый reopen. Преемник учитывается
   один раз. Старый FAIL сохраняется независимо от успеха локального proof.

Для реализации потребуется отдельно согласованная правка scoped auditor,
нормализации и тестов. Существующий graph_proof требует source-node input и
не подходит для imports без явного разделения проверки входов. Положительная
fixture — полное неизменённое original evidence либо новая dedicated live;
отрицательные случаи: чужие pins/source/port/grant, отсутствующий prepared/end,
дублирование, частичный/неизвестный эффект, pending, потеря after graph, неверная
геометрия, лишний configure/execute, изменённый CSV/schema, ранний/тот же ID,
поддельная user-v1 проекция/inspect, отсутствие полного save/reopen.

Текущий run всё равно FAIL из-за `import-allnull` AMBIGUOUS/configure и отсутствия
полной цели. Предложение не объявляет этот run принятым и не разрешает новый Hermes.

## Последующая реализация

После согласования координатором выполнена фаза
`node14:import-refusal-verifier:1:841d6443`.
[Результат, отдельная живая проверка и следующий комплект](node14-import-refusal-verifier-2026-09-13.md).
Исходное описание предложения и прежний FAIL выше сохранены как история.

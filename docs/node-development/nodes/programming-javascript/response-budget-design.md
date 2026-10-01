# JavaScript: граница доставки J21

Продолжение [плана](plan.md), после current context и reordered input.
Это решение для source/direct-runtime проверки; candidate/CLI J01/J21 и
поведение модели остаются отдельной приёмкой в F. Продуктовая база прежняя.

## Подтверждённый пробел

На child `9c93b067e1206c16653b83751f9fbe289eb80c2b` настоящие фабрики
14 обработчиков и isolated JS handler формируют полные карточки через
`describeNodeTypes` и `userActionInventory`. В `dock_action_describe` bridge
сериализует их одним текстовым MCP-блоком, без проверки размера. Каждый
node contract сохраняет собственный полный manifest; внешний manifest
не содержит дополнительных `skillRevision`/`loginomProfile` этих карточек.

Source-only измерение с пустыми pins: JS body9464 bytes, весь набор15 body43717.
Отдельное измерение с синтетическими pins реальной структуры и text-only
MCP-envelope: JS11597 wire bytes, весь набор62163, compact knowledge bundle7313.
Это sizing fixture, не текущие target pins и не MCP/Agent delivery proof.
Сырые JSON bytes недостаточны: внешний JSON повторно экранирует текст блока.
Полный набор может превышать и46000 wire, и default Agent50KiB.

Compact `dock_node_read` уже описывает `kind:context`, source fallback и
technical names из input target/output source fields. Повторно добавлять эту
подсказку не требуется. Existing context/source readers имеют собственные
bounded contracts. `nodeResultReply` дополнительно проверяет1MiB exact-table
serialization, что не доказывает соответствия проектным46000/Agent limits.

## Решение

Проверять полностью сформированный user-v1 MCP tool reply на последней границе
bridge, после всех text/structuredContent и диагностических блоков. Считать
UTF-8 bytes всего сериализованного CallToolResult и фактического текста,
который Agent получает объединением text blocks через два LF, а также его
число строк. Default consumer bounds50KiB/2000 строк — верхняя дополнительная
граница; эффективные candidate overrides необходимо зафиксировать отдельно.
Не объявлять defaults доказательством доставки при иной конфигурации.

Для каждой полной JS describe card независимо проверить20000 wire bytes;
для всего ответа —46000 wire bytes и consumer bytes/lines. Сохранить все
parameter_schema, knowledge, hashes, limitations и manifests. Не удалять
карточки, поля, правила, строки таблицы или provenance ради прохождения лимита.
Не подменять текущий reader digest старой квитанцией.

При превышении describe вернуть маленький явный отказ и предложение запросить
меньше типов. Это read-only request; он не запускает браузер и не отменяет
операцию. При переполнении другого ответа сообщить отказ доставки и сохранить
исходную квитанцию/operation_id; не утверждать NOT_APPLIED или отсутствие
эффектов уже завершённой операции. Unknown effects остаются unknown.
Отказ не разрешает повтор мутаций, новый browser owner или расширение deadline.
Полный локальный результат не считается доставленным модели.

Diagnostic profile сохраняет прежнюю полноту и лимиты. Ordinary preview
сохраняет существующий контракт частичной выборки; такой preview не является
PASS проверки полного JS результата. Source cap/chunk limits проверять
самостоятельно: маленький describe не доказывает доставку полного source.

## Проверка

- Actual factories и schemas: single JS и помещающийся multi-type набор
  сохраняются полностью; большой batch явно отказывает; raw receipts неизменны.
- MCP SDK roundtrip через настоящий bridge: first/reused prepare, describe
  с JS knowledge, маленький batch, отказ большого batch и успешный следующий
  запрос через то же соединение. Browser adapter fixture — только внешний
  транспорт; результат не выдаётся за live/candidate/CLI.
- Worst quotes, backslashes, control characters, Unicode и допустимые source
  lines; отдельно card20000, whole46000, bytes/lines и точные границы.
- Exact full-table overflow не превращается в sample/summary; оба content и
  structuredContent учитываются; error/advice blocks тоже входят в размер.
- Source/context/chunk regressions и полный client suite на финальном source.
  В candidate проверить effective limits и actual `metadata.truncated=false`,
  отсутствие `readback_summary` и полный маленький6×4 результат.

Все перечисленные проверки здесь запланированы. Source-only sizing не закрывает
J21; текущая точка продолжения — в [checkpoint](checkpoint.md).

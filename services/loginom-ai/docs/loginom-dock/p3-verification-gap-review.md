# P3: карта независимой проверки и следующий участок

Дата: 6 сентября 2026. Обзор исходников, плана и локальных E2E/Help; новых live-доказательств в этом обзоре нет. Браузер исследует основной агент. Hermes не запускался, старые audits не изменялись. OpenViking `find` с exact target `viking://resources/loginom-dock` не нашёл подходящего контекста. Источники репозитория имеют приоритет.

## Главный вывод

Следующий цельный участок — **настройки текстового импорта → apply → повторное открытие мастера → независимое чтение схемы и настроек того же узла**. Он непосредственно устраняет текущую причину остановки цепочки и создаёт образец проверки настроек для остальных мастеров. После этого следует строить общий участок **новый запуск → полный типизированный результат**, а затем **save → close → exact-path reopen → settings readback → новый запуск → тот же результат**. Полный Hermes replay имеет смысл после готовности участка, а не после каждого отдельного жеста.

`data_pipeline.py` оставляет все семь domain gates ложными. Это корректно: существующие диагностические функции не доказывают полный результат или сохранность пакета. При подключении новых verifiers каждый gate должен получать собственное доказательство; устранение заглушки не равно приёмке P3.

## Что уже можно использовать

| Код | Реально проверяет | Не проверяет |
| --- | --- | --- |
| `data_pipeline.py:audit` | Одну загрузку/верификацию, inspection до следующей мутации; переиспользует transfer audit | Настройки, выполнение, сохранение и данные; всегда diagnostic-only |
| `settings_evidence.py:bound_receipts` | Единственные call/reply/immutable outcome, порядок, equality и cleanup действий | Полноту сценария и семантику настроек |
| `settings_evidence.py:calculator_state/roundtrip/diagnose` | Выбранное real-выражение, полный текст связанного редактора; закрытие/открытие мастера в том же контексте с новым document_ref | Input/output mappings, весь список выражений, импорт/группировку/Reform; сохранность пакета |
| `rendered_results.py:compare` | Точное совпадение типов и видимых ячеек, null/empty, Decimal с явно переданным форматом, multiset всех ожидаемых строк | Источник формата, полноту реального набора, точность отображения, owner и свежесть исполнения |
| `rendered_results.py:diagnose` | Сопоставляет observation с journal outcome; не берёт таблицу из ответа модели | Не аттестует numeric format, перебирает стадии по форме таблицы, не связывает view с конкретным узлом/портом |

Диагностику результатов стоит перевести на общий строгий receipt binder: текущая функция проверяет один matching call и один journal event, но в отличие от `bound_receipts` не проверяет единственность matching tool reply. Дедупликация по operation_id не заменяет отказ при двух ответах. Это локальное усиление проверки, не основание переписывать старые audits.

## Недостающие доказательства по gate

| Gate | Минимальная независимая цепочка | Причины отказа |
| --- | --- | --- |
| `wizard_settings_readback` | Upload identity/SHA → точный server source path → связанный import owner; все страницы формата/схемы/mapping; apply и новое открытие с теми же параметрами | Draft-only чтение, усечённые columns, нет source identity, чужой owner, скрытый editor value, незавершённый refresh |
| `calculator_expression_and_mappings` | Полный список выражений и exact Amount/real/formula; Quantity и UnitPrice привязаны к полям нужного upstream output; output mappings; чтение после apply/reopen | Совпала только формула, одноимённые чужие поля, лишнее/выключенное выражение, изменённые mapping или тип |
| `group_keys_and_aggregations` | Только Region как ключ; Quantity/Sum, Amount/Sum, Count строк; exact output names/types и исключённые поля; если добавлен Reform — отдельное доказательство conversion и mapping | Совпали числа, но не операции; Count непустых вместо всех строк; final integer подменён real; не доказан переход Group → Reform |
| `fresh_execution_identity` | Новый host operation связан с наблюдённой активацией конкретного package/node/graph settings revision; исходное состояние, запуск один раз, terminal status/errors; результаты принадлежат этому запуску | Старый active icon/history, собственный UUID без наблюдаемого нового эффекта, смена конфигурации во время ожидания, timeout с повторным запуском |
| `complete_typed_results` | Exact owner/port/view + execution; полная схема, наблюдённый total row count, покрытие всех строк/столбцов, точный формат/precision, null visibility, отсутствие фильтрации/ошибки; сверка 6/6/3 строк | Количество видно только из expected; virtualized DOM принят за полный набор; округление; null marker отключён; чужой порт; страницы разных executions |
| `saved_reopened_settings` | Проверенные настройки всех узлов до save → точный save path/receipt → подтверждённое закрытие → reopen этого пути без запуска → свежий owner mapping и полное повторное чтение настроек/связей | Только graph fingerprint или новый заголовок; пакет не закрывался; opened другой одноимённый путь; save ambiguity; новый editor принят за новое открытие пакета |
| `reexecution_results` | После успешного settings roundtrip отдельный start с новым execution identity → полный результат с той же схемой и значениями | Старый preview/cache без нового выполнения, запуск до проверки persisted settings, только равенство двум снимкам без сопоставления expected |

Стабильные имена и refs нельзя смешивать: после закрытия пакета runtime refs могут измениться. Нужна явная привязка нового instance к точному пути и повторно проверенной семантической структуре. Существующий node-level `roundtrip`, требующий неизменного document/workflow/tab, нельзя целиком использовать для package reopen.

## Что важно проверить в UI до реализации результатов

Уточнение live 6 сентября: текстовый импорт `ColumnDefsTuning` имеет собственный лимит предпросмотра 200 строк по `integration/import/txt/README.md`. Общий лимит ниже нельзя переносить на этот мастер. После изменения формата старые conversions в Result сохранились до «Определить типы данных»; RAW при этом показывал исходные дроби. Это ручное наблюдение, не acceptance proof.

1. Различать **предпросмотр мастера**, **быстрый просмотр порта** и **визуализатор Таблица**. Help `preview.md` ограничивает предпросмотр мастера первыми 100 строками. `quick-view.md` описывает другие лимиты для просмотра порта. Оба сокращают real до двух знаков и не дают менять формат. Порог 100 нельзя переносить на просмотр порта.
2. Для exact numeric proof предпочтительно исследовать **Таблицу**: Help `table/format.md` говорит, что default отображает точность набора; нужно наблюдать, что форматирование/особый формат действительно не округляют значение. Одного текста Help или совпадения ожидаемых дробей недостаточно: ошибочное 52.004 тоже выглядит как 52.00 при округлении.
3. Найти наблюдаемый total row count и независимую границу данных. Help сообщает, что в быстром просмотре total снизу показывается, если строки не помещаются. Отсутствие счётчика у маленькой таблицы не означает ноль и не доказывает полноту. Табличный просмотр в режиме формы имеет переход к последней строке; пригодность его границ требует live-проверки.
4. Проверить кнопку показа null. В Таблице она переключаемая; отсутствие CSS null marker при выключенном отображении нельзя принимать за пустую строку.
5. Привязать view к exact выходному порту: закреплённый быстрый просмотр при выборе узла показывает первый порт, а другие порты имеют вкладки. Одного workflow prefix недостаточно.
6. Исследовать наблюдаемый запуск для коротких задач: E2E ждёт active color, исчезновение Stop и отсутствие ошибок, но отдельного execution ID не даёт. Если running-фаза слишком короткая, не выдумывать доказательство; проверить иной свежий наблюдаемый receipt/status в UI. Timeout относится к ожиданию, не разрешает ещё один старт.

## Короткие проверки и порядок реализации

### A. Импорт как законченный участок

- Подготовить отдельный diagnostic package с pinned CSV и явным `/test` source, без изменения состояния активного Hermes.
- Прочитать baseline всех пяти полей, настроек файла и mapping; изменить type/kind, дождаться settled readback; apply; открыть заново и сравнить семантический baseline.
- Добавить independent `import_state` и receipt-sequence verifier рядом с существующим settings verifier. Собирать страницы в одном owner/context без промежуточных мутаций; `complete:false` у текущего import_columns не повышать до полной схемы без доказательства границ.
- Негативы: скрытое старое значение, задержанное изменение kind, другое поле/owner, duplicate editor, incomplete columns, применённый неверный тип, потеря ответа без повторного жеста.
- Live native проверка подтверждает драйвер. Короткий Hermes сценарий подтверждает автономное использование. Полный P3 run остаётся отдельно.

### B. Общая проверка «новый запуск → данные»

- Сначала на вручную проверенном коротком сценарии исследовать execution lifecycle и Таблицу; оформить observation contract для owner, count, coverage, format и null visibility.
- Реализовать один независимый `result proof`, объединяющий эти наблюдения с существующим `compare`; использовать его для import, calculator и final output, не три несвязанных парсера.
- Unit-негативы: 7-я скрытая строка при expected 6; отсутствующий столбец; дубликат страницы/ответа; foreign port; старое execution; отключённые null; rounded near-match; фильтр; empty table с неподтверждённым total; разрыв owner между страницами.
- Live короткие проверки: непустой набор и корректный пустой набор; одна ошибка формулы и исправление; повторное выполнение без повторного start после потерянного ответа.

### C. Сохранение и воспроизведение

- Переиспользовать проверенные settings manifests и result proof из A/B, затем отдельно добавить state machine сохранения/закрытия/открытия.
- E2E `OpenPackage` по умолчанию вызывает `LaunchAllNodes`, а `ClosePackage` по умолчанию отвечает «Нет» на сохранение. Эти удобства тестов нельзя переносить в продукт: reopen без запуска; unsaved policy задана явно.
- Короткий пакет с двумя одинаковыми basename в разных разрешённых каталогах проверяет exact path. Отдельные негативы: close cancel, read-only/exclusive, pending save и stale original instance. Не трогать посторонние пользовательские пакеты.
- После reopen прочитать все настройки и mappings, затем новый execution и полный результат. Прогнать один сквозной Hermes сценарий на `openai-codex / gpt-5.6-luna / medium`, заморозив runtime/harness.

## Дополнительные требования P3, которые не покрываются семью gate сами по себе

Политики package create/open/close (unsaved/read-only/exclusive/overwrite), upload reject/conflict/download budget, отдельные execution start/status/wait/stop, корректный пустой результат, неверные delimiter/type/formula и исправление агентом остаются требованиями плана. Один успешный sales.csv run не закрывает их. Для них нужны отдельные заранее определённые короткие cases и сводное подтверждение перед P3 PASS.

## Проверенные источники

В этом репозитории:

- `docs/plans/2026-09-02-loginom-dock-implementation-plan.md`, P3, строки 1381–1476.
- `docs/loginom-dock/agent-handoff.md`, checkpoint остановки 6 сентября.
- `tools/loginom-acceptance/data_pipeline.py`, `settings_evidence.py`, `rendered_results.py` и их тесты.
- `tools/loginom-acceptance/fixtures/data-pipeline/expected.json`.
- `client/lib/workspace-ui.mjs`, dataIdentity и table_cells: только rendered cells, предел 120, не execution/full result proof.

Локальные первичные источники:

- `/Users/kartamyshev/Git/e2e-tests/bg/helpers/packages.ts`: `OpenPackage` строки 83–109; `ClosePackage` строки 118–126.
- `/Users/kartamyshev/Git/e2e-tests/bg/helpers/workflow/node.ts`: `LaunchNodeCb`, `LaunchNodeSuper`, `DeactivateNode`.
- `/Users/kartamyshev/Git/e2e-tests/bg/helpers/workflow/previewTable.ts`: порт, ожидание активации, работа с закреплённой панелью, ограниченное сравнение cells. `CheckPreviewDataShowing` требует первую строку, поэтому не годится как empty-result acceptance.
- `/Users/kartamyshev/Git/e2e-tests/bg/sels/views/sTable.ts`: типы/null/format, selectors formatting, decimal digits и custom format. Есть индекс у Header, но часть остальных selectors фиксирует BrowseView без индекса: переносить только после live binding.
- `/Users/kartamyshev/Git/loginom-help/data/visualization/preview/preview.md` и `quick-view.md`.
- `/Users/kartamyshev/Git/loginom-help/data/visualization/table/README.md` и `format.md`.
- `/Users/kartamyshev/Git/loginom-help/data/interface/packages.md`.
- `/Users/kartamyshev/Git/loginom-help/data/workflow/interactive-mode.md` и `workflow-progress-control.md`.

Обзор не является приёмкой и не меняет процент готовности. Реализация и live-проверки перечисленных контрактов остаются впереди.

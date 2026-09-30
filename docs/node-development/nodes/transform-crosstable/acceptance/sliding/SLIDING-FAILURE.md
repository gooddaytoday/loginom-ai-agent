# LOG-29: ошибка чтения динамической схемы CrossTable Sliding

## Результат и область дефекта

**FAIL:** после замены CSV существующий узел CrossTable в скользящем режиме выполняется, но Loginom Dock отклоняет чтение его новой схемы, сравнивая её со схемой предыдущей операции. Desktop не завершает сценарий и не сохраняет итоговый пакет.

Подтверждена ошибка пути повторного чтения. Неверный расчёт самого узла Loginom не доказан. Fixed на том же SHA прошёл отдельную проверку, включая независимое открытие сохранённого пакета; серверный PASS остаётся отдельным доказательством.

Живой сбой повторного чтения наблюдался в одном завершённом до этой точки прогоне. Дополнительно детерминированно воспроизведены два отказа настоящей функции `alignReadSchema`: изменение количества полей и изменение меток при прежнем количестве. Это проверка условия в коде, а не второй полный прогон Desktop.

## Проверенное окружение

- Дата: 29 сентября 2026, Mac arm64; стенд Loginom 7.4.2.
- PR: https://github.com/gooddaytoday/loginom-ai-agent/pull/15
- Точный SHA: `1e994aa50bf65ced588f58d2658caeac6e30a4f3`.
- Desktop-кандидат: `Loginom AI Agent Dev.app`, версия `0.1.17-log29mac.1`, запущен непосредственно из каталога сборки. Проверка установленного приложения не выполнялась.
- Закреплённые зависимости: Bun 1.3.14, Node 24.19.0, Chromium 1243.
- Модель в Desktop: GPT-6.1 Sol / Low.
- Отдельный профиль и аккаунт Loginom `test-6`; пакеты в `/test-6`.
- Авторизацию ChatGPT и настройку подключения Loginom пользователь выполняет самостоятельно.
- Профиль тестового кандидата использовал `LOGINOM_AI_AGENT_TEST_ONBOARDING=1`: история чатов находилась в памяти. Этот режим не проверяет сохранность истории после перезапуска.

Рабочее дерево точного SHA: `/Users/kartamyshev/.codex/worktrees/crosstable-mac-check/loginom-ai-agent`.
Каталог доказательств: `/Users/kartamyshev/Git/loginom-ai-agent/.local/node-development/evidence/LOG-29-mac-20260929-2110`.

## Входные файлы

Сохранить UTF-8 CSV с переводами строк LF и завершающим переводом строки.

### base.csv

```csv
Region,Category,Amount,Quantity
North,A,10.0,1
North,A,5.0,1
North,B,?,1
South,B,7.0,1
South,C,8.0,1
South,?,4,1
```

113 байт; SHA-256: `c390928fefbe2fe6c453b1df03fabfe27977ee992a91b60d4e4989ff0037c4bb`.

### changed.csv

```csv
Region,Category,Amount,Quantity
North,A,10.0,1
North,D,12.0,1
South,B,7.0,1
South,D,4.0,1
```

90 байт; SHA-256: `427cd5e638f3e1b063a4baf1a2019c1e5d3fe89db964d7c0aa2392f285a0d958`.

Файлы использованного прогона находятся в `/private/tmp/LOG-29-mac-test6-sliding`. Доставка обоих файлов через Dock подтверждена размером, хешами и `artifact_delivery_completed=SUCCEEDED`, `upload_completion_verified=true`.

## Воспроизведение через Desktop

1. Подготовить Desktop из указанного SHA и отдельный профиль. Пользователь входит в ChatGPT, выбирает GPT-6.1 Sol / Low, настраивает свободный аккаунт Loginom и сохраняет настройки. Не использовать занятую сессию разработчика.
2. Создать новый чат и новый пакет. Прикрепить оба CSV через файловый диалог Desktop. Выбрать уникальное имя итогового пакета, которого ещё нет на сервере.
3. Отправить задание ниже. Важно заменить источник в существующем импорте и выполнить существующий CrossTable, сохранив их идентификаторы. Новый CrossTable или повторное применение настроек могут скрыть дефект.
4. Убедиться, что исходный импорт выполнен, а исходный CrossTable дал 9 полей и 2 строки с подтверждённым полным чтением.
5. После успешной замены источника на `changed.csv` запросить повторное чтение CrossTable через `loginom_dock_node_read` с `source_operation_id` исходного построения CrossTable.
6. Зафиксировать завершение выполнения того же узла, затем отказ в фазе `read` с текстом `Output schema changed since the source operation`.
7. Проверить журнал операции и состояние пакета: в наблюдавшемся прогоне итоговый порт не возвращён, сохранение не произошло. Не объявлять такой прогон PASS.

Задание, использованное в прогоне:

```text
Импортируй base.csv: поля Region, Category, Amount, Quantity; ? — NULL.
Amount задай вещественным (real), Quantity — числовым.
Построй узел Кросс-таблица: строки — Region, колонки — Category
в скользящем режиме без ограничения категорий.
Для Amount и Quantity выбери сумму. Выполни узел и покажи результат.
Затем в том же импорте замени источник на changed.csv с той же схемой,
снова выполни существующий узел и покажи итоговую таблицу.
Сохрани пакет по новому уникальному пути в каталоге своего аккаунта.
Не перезаписывай существующие файлы и не меняй чужие пакеты.
```

Модель может выбрать другую последовательность инструментов. Для точного воспроизведения пути reader существенен следующий эквивалентный вызов; идентификатор исходной операции брать из нового прогона:

```json
{
  "operation_id": "sliding6-cross-changed-read",
  "source_operation_id": "sliding6-cross-base",
  "read": {"ports": [0], "sample_rows": 100, "require_exact_numbers": true},
  "budget_ms": 600000
}
```

Инструмент: `loginom_dock_node_read`. Имена операций здесь показывают архивный прогон; новые уникальные имена и возвращённые ссылки узлов необходимо получать в новом прогоне.

Параметры исходного CrossTable в зафиксированной операции:

```json
{
  "mode": "pivot",
  "parameters": {
    "rows": [{"kind": "input_field", "name": "Region"}],
    "column": {"kind": "input_field", "name": "Category"},
    "facts": [
      {"field": {"kind": "input_field", "name": "Amount"}, "functions": ["sum"]},
      {"field": {"kind": "input_field", "name": "Quantity"}, "functions": ["sum"]}
    ],
    "columns": {"mode": "sliding", "min_values": 0}
  },
  "finish": "execute",
  "read": {"ports": [0], "sample_rows": 100, "require_exact_numbers": true}
}
```

Граф: `imports.text` → `transform.cross_table`, одна связь выход 0 → вход 0.

## Ожидаемые схема и данные

Исходные категории: `<...>` (NULL), A, B, C — 9 полей вместе с Region. После замены: A, B, D — 7 полей. Категории NULL и C исчезают. Технические имена генерируются заново по текущему составу: исходное `C_1_*` относится к NULL, после замены — к A. Нельзя сохранять старую привязку имени к категории.

В итоговой схеме Region имеет тип `string`, суммы — `real`:

| Техническое имя | Ожидаемая метка |
|---|---|
| Region | Region |
| C_1_Amount_Sum | A\|Amount\|Сумма |
| C_1_Quantity_Sum | A\|Quantity\|Сумма |
| C_2_Amount_Sum | B\|Amount\|Сумма |
| C_2_Quantity_Sum | B\|Quantity\|Сумма |
| C_3_Amount_Sum | D\|Amount\|Сумма |
| C_3_Quantity_Sum | D\|Quantity\|Сумма |

| Region | A Amount | A Quantity | B Amount | B Quantity | D Amount | D Quantity |
|---|---:|---:|---:|---:|---:|---:|
| North | 10 | 1 | NULL | NULL | 12 | 1 |
| South | NULL | NULL | 7 | 1 | 4 | 1 |

Ожидания независимо рассчитаны из CSV; машиночитаемый результат — `expected-sliding-test6.json`. Исходная схема и значения прошли точное сравнение (`base-sliding-test6-audit.json`).

## Фактически наблюдавшийся отказ

Чат второй попытки: `ses_f114a7e50ffePXCgGJCRmtI13F`; начало 22:47 МСК, длительность 5 мин 57 с.

- `sliding6-import-base`: SUCCEEDED.
- `sliding6-cross-base`: SUCCEEDED; 9 полей × 2 строки, независимый аудит PASS.
- `sliding6-import-changed`: SUCCEEDED; импорт остался тем же.
- `sliding6-cross-changed-read`: существующий CrossTable выполнен, затем чтение остановилось.

Архивные идентификаторы для поиска в журнале:

- Документ: `1790711283935-r7edzbt3bol`.
- Импорт: `dbb8b310-4711-44ab-ae71-c314791c587f`.
- CrossTable: `1131975e-7b2a-4cd8-aada-2cdaa6392edf`.
- Завершённое повторное выполнение: `1790711283935-r7edzbt3bol:171:7`.

Ошибка: `NODE_APPLY_STOPPED: Output schema changed since the source operation`.
Состояние: `AMBIGUOUS`, `pending_phase=read`, `effect_possible=true`, `cleanup_complete=false`, `output.ports=[]`, `package_saved=false`.

Нативное наблюдение показало 7 полей с метками A/B/D. Отображаемые значения согласуются с ожиданиями, но признаки `numeric_precision_verified`, `unfiltered_verified`, `execution_freshness_verified` равны false. Это неполное подтверждение; оно не заменяет полный успешный результат reader.

Попытки inspect/recover/resume/cancel не привели к завершению сценария. Итоговый `.lgp` не сохранён, поэтому независимое холодное чтение Sliding не выполнено. Закрытие оставшегося черновика и сессий test-6 на момент составления инструкции ожидает подтверждения пользователя; запрошено завершение только собственных сессий. В этом SHA Desktop Dock не предоставляет подтверждённого закрытия пакета и выхода для данного состояния.

## Причина в коде точного SHA

`packages/loginom-runtime/client/lib/node-read-contract.mjs`, функция `alignReadSchema`, строки 71–79:

```js
need(actual.length === expected.length && new Set(actual.map(f => f.name)).size === actual.length,
  'Output schema changed since the source operation');
// Далее для каждого технического имени проверяются прежние name, label, type.
```

`packages/loginom-runtime/client/lib/node-read-driver.mjs:55` вызывает `alignReadSchema(raw.columns, schema)` после нового выполнения. `schema` сохранена из исходной операции, а `raw.columns` отражает новое состояние.

Поэтому нормальная для Sliding смена 9 → 7 полей отклоняется. Даже при прежнем количестве полей смена категории/метки может отклоняться второй проверкой с `Output field identity changed since the source operation`.

Это объясняет зафиксированный отказ reader. Обход повторной настройкой CrossTable в проверке не применялся. Исправление кода в рамках проверки не выполнялось.

## Детерминированное воспроизведение условия без Loginom

Рядом с этим документом сохранён `reproduce-sliding-schema.mjs`. Он импортирует настоящую функцию из чистого worktree указанного SHA и проверяет два отказа. Для переноса на другой Mac изменить только абсолютный путь импорта на путь того же SHA.

Запуск из каталога доказательств:

```sh
./desktop-candidate/cli/resources/loginom/bin/node ./reproduce-sliding-schema.mjs
```

Фактически выполнено с Node 24.19.0, код выхода 0. Вывод сохранён в `sliding-schema-repro.log`:

```text
Sliding 9 → 7 columns: confirmed rejection: Output schema changed since the source operation
Same count, category C → D: confirmed rejection: Output field identity changed since the source operation
```

Код 0 здесь означает, что ожидаемые отказы воспроизведены; это не PASS сценария CrossTable.

## Доказательства и условия повторной проверки исправления

- `sliding-test6-attempt2-failure.json`: полное событие отказа, параметры и ссылка на журнал.
- `sliding-test6-observed-changed-schema.json`: наблюдавшаяся новая схема.
- `sliding-test6-raw-table-audit.json`: неполная сверка отображаемых значений с явными ограничениями.
- `base-sliding-test6-audit.json`, `expected-sliding-base-test6.json`, `expected-sliding-test6.json`: исходный аудит и независимые ожидания.
- `reproduce-sliding-schema.mjs`, `sliding-schema-repro.log`: локальное воспроизведение условия кода.
- `REPORT.md`: общий итог проверки, Fixed PASS, Sliding FAIL и состояние готовности PR.

Первичный журнал второй попытки относительно каталога доказательств:

```text
desktop-profile/desktop/loginom/runtime/generations/5/chats/8a6f4dcafd800c760e54fc37f1046f21771acd42e09f75446c94eb29d4d7947b/attempts/ceaba40a-be26-4b58-b477-fe49c8597ec3/execution-events.jsonl
```

После исправления повторить новый полный прогон: те же CSV, один импорт и один Sliding CrossTable, успешное полное чтение до и после замены, сверка всей схемы/меток/типов/строк и привязки категорий, сохранение после последнего чтения, подтверждённое завершение собственных сессий, независимое открытие сохранённого пакета и выполнение графа. Только совпадение всех этих доказательств позволяет заменить FAIL на PASS.

Файлы профиля и подключения могут содержать конфиденциальные данные: они остаются локально и не включаются в публикуемую инструкцию.

## Отдельный сбой первой попытки

### Сбой импорта до CrossTable

SHA: `1e994aa50bf65ced588f58d2658caeac6e30a4f3`, Desktop 0.1.17-log29mac.1, macOS arm64, Loginom 7.4.2, GPT-6.1 Sol / Low, отдельный test-6. Первая попытка Sliding — FAIL; корректность самого CrossTable в этой попытке не проверена.

Шаги для воспроизведения:
1. В отдельном Desktop-чате открыть проект `/private/tmp/LOG-29-mac-test6-sliding`, прикрепить `base.csv` и `changed.csv` через файловый диалог.
2. Отправить задание из `task.md` для нового пакета: импорт base, скользящий CrossTable с суммами Amount/Quantity, замена источника на changed, повторное выполнение, полное чтение и сохранение.
3. Dock создаёт новый черновик Package1 и подтверждает доставку обоих CSV по размеру и SHA-256 в /test-6.
4. `import-base-test6` создаёт узел импорта `475d7188-e99b-4400-b07d-8850c371df58`, открывает мастер и останавливается в фазе configure со статусом AMBIGUOUS: `UI_EPOCH_CHANGED` / «The document changed while checking the target; observe again».
5. Проверка операции и свежее наблюдение показывают открытый мастер. `loginom_dock_node_resume` отклоняет продолжение: нет checkpoint без unresolved phase. `loginom_dock_node_cancel` оставляет AMBIGUOUS и cleanup_complete=false.

Ожидание: безопасное продолжение после свежего наблюдения либо подтверждённая отмена собственного мастера. Наблюдение: выполнение осталось незавершённым; CrossTable не создан, пакет не сохранён, закрытие и выход не подтверждены. Корневая причина изменения интерфейса не установлена. Сбой наблюдался один раз; новая попытка будет отдельным доказательством.

Доказательства: `sliding-test6-attempt1-failure.json`, соответствующий execution-events.jsonl, итог Desktop-чата `ses_f114fac87ffePlahbQ6BCrAhdp`. Старую попытку нельзя засчитать как успешную даже при успешном повторе.


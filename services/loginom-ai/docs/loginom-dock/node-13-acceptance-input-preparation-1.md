> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-92cfa05cb0c1` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 13: входы приёмки подготовлены, допуск остаётся закрытым

Команда: `node13:acceptance-input-preparation:1:ed53b0189fa92dfc879015ee08580dcadf2c3cd2`.
Дата: 2026-09-13. Ветка `codex/node-13-date-time`, исходный HEAD `ed53b0189fa92dfc879015ee08580dcadf2c3cd2`.
Это подготовка до разрешённой интеграции, не автономная приёмка и не admission узла.

## Подготовленный объём

Естественное ТЗ `packages/loginom-runtime/tools/loginom-acceptance/goals/date-time-sales.txt` требует
месячные и квартальные суммы продаж, полный календарный результат по двум датам
и пустую ветку. Оно описывает бизнес-результат и точные имена/метки/порядок,
но не содержит API-рецепта, размера sample_rows, fault injection или дополнительного
переоткрытия. Шесть аналитических узлов, семь выполнений: импорт, исходный календарь,
переименование его сквозных/сохранённого computed полей, две группировки, фильтр,
пустой календарь. Порядок независимых веток не зафиксирован.

`fixtures/date-time/sales.csv`: **505 байт, UTF-8 без BOM, LF, 12 строк данных**.
Две типизированные даты, високосный день, границы месяца/квартала/года,
несимметричные NULL, повторения месяцев, отрицательная сумма. Все Id положительные;
пустая ветка получается условием Id < 0, а не новым режимом импорта пустого CSV.
Источник здесь проверен по локальным байтам/разбору. Доставка на Loginom и
проверка серверных байтов ещё не выполнялись для этой новой fixture.

Frozen `expected.json` пересчитывается независимым Python Gregorian oracle,
без импорта JS handler/native enum и без observed output. Результаты:

| Таблица | Строки × столбцы | Смысл |
| --- | --- | --- |
| Источник | 12×4 | Id, DateA, DateB, Amount |
| Календарь до переименования | 12×27 | 12 операций по каждой дате, Id/Amount/DateA |
| Календарь окончательный | 12×27 | RowId, SalesAmount, SavedYearA; точные метки |
| Пустой календарь | 0×27 | Та же окончательная схема, DateB excluded |
| Месяцы | 8×3 | NULL/NULL=42; 2023/12=10; 2024/1=50, /2=75, /3=70, /4=110, /12=90; 2025/1=100 |
| Кварталы | 6×3 | NULL/NULL=42; 2023/4=10; 2024/1=195, /2=110, /4=90; 2025/1=100 |

Общая сумма — **547**. Порядок строк группировок произвольный, сравнение полное
по мультимножеству. Порядок календарных строк и всех столбцов точный. DateB
исключён; его служебная метка DateB проверяется отдельно. Обе входные даты имеют
метку «Дата» и адресуются по имени, не по неоднозначной метке.

Все 12 операций сохранены в исходном scope: date, month_start/end,
quarter_start/end, year_start/end, hour, day_of_month, month, quarter, year.
Конец периода — последний день в 00:00:00.000; timezone unspecified; NULL
сохраняется. ISO/недели/строковые форматы не добавлены. Вход/выход calendar
фиксируются при autosync=false из-за ранее подтверждённой нативной перестановки.

## Аудитор и отдельный запуск

`date_time_sales_acceptance.py` проверяет весь declared goal: исходное ТЗ/хэши,
реальную завершённую модель Sol/low без fallback, закреплённый runtime/catalog,
публичные вызовы и сырые квитанции, доставленные байты, точный граф, конфигурации,
полные таблицы, финальный checkpoint и отдельную persistence-диагностику.
Компоненты `date_time_goal_evidence.py` и существующие независимые raw-аудиторы
сверяют поля/матрицы/связи и данные. Полнота — total=row_count=returned=sample_rows
и длина sample, sample_complete=true, отсутствие truncation, точная схема и все
значения. Число запрошенных sample_rows не обязано равняться 10.

Отдельный `date_time_launch.py` по умолчанию только проверяет допуск. `--run`
разрешён лишь с полным внешним admission-документом и командой слота координатора.
Тонкое подключение новой цели в существующем `run.py` использует его subscription
connection, auth guard, export/redaction и изолированные homes; второй executor
не создан. Общие node recovery, клиентский runtime и плагины не изменялись.

Допуск проверяется перед чтением авторизации/подготовкой runner и ещё раз перед
моделью после MCP precheck. Проверяются точный Git HEAD, runtime inputs, bytes
source archive/manifest, hashes внешних gate receipts и их evidence, соответствие
команде/зарезервированному run_id, модели, аккаунту, storage и бюджету. Одна папка
run создаётся с exist_ok=false. Состояние только в этом worktree `.dock`, отдельный
профиль каждого запуска. Цель не добавлена в общий CLI choices: вход только через
собственный guarded wrapper. Бюджет не выбран: внешний допуск должен его задать;
технический потолок только для этой цели — 14400 секунд/100 turns, не выданный слот.

`admission.pending.json` намеренно содержит null для final pins/архива/catalog/run_id
и open для shared gates. Его нельзя превращать в подтверждение заполнением
фиктивных SHA или заменой open на passed. Gate receipts — формат отчёта независимого
владельца и координатора, **не новые runtime API**. Они должны ссылаться на реальные
файлы доказательств с проверенными SHA; wrapper проверяет привязки, но не заменяет
независимый разбор raw recovery evidence владельцем общей части.

## Команды

Из корня этой рабочей копии; все команды ниже существуют. Первые четыре не
запускают модель, MCP или браузер:

```sh
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_admission.py --inputs-only
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_admission.py --render 20260913-120000-1234abcd
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_goal_oracle.py
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_launch.py --admission packages/loginom-runtime/tools/loginom-acceptance/fixtures/date-time/admission.pending.json
```

Последняя сейчас ожидаемо возвращает **exit 1 / passed=false / model_started=false**.
run_id в примере render — только пример рендеринга, не зарезервированный запуск.

Только после интеграции, финальной фиксации, каталог admission и отдельного слота:

```sh
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_launch.py --admission unavailable:artifact-1e7192209b61d4a1
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_launch.py --admission unavailable:artifact-1e7192209b61d4a1 --run
python3 packages/loginom-runtime/tools/loginom-acceptance/date_time_sales_acceptance.py unavailable:artifact-5e011a6187c9e077 --admission unavailable:artifact-1e7192209b61d4a1 --diagnostics unavailable:artifact-8d8d08abb8be2bf5 --output unavailable:artifact-f929f59998175206
```

RUN_ID заменяется реальным допущенным ID. Файлы результатов создаются без
перезаписи прежнего evidence. Финальный audit требует самостоятельного экспорта
`request.json`, `scenario.txt`, `evidence.json` штатного runner; summary модели
не является evidence и не может дать PASS.

## Persistence как отдельная диагностика

Нормальный Hermes один раз сохраняет итоговый новый пакет через checkpoint в конце.
Аудитор требует awaited save, тот же открытый workflow, точный граф, путь и
публичную успешную квитанцию. Не требуется intermediate save или save_as.

После завершения Hermes независимая диагностическая сессия открывает **точно этот
пакет напрямую**, без SaveAs-копии. Новая диагностическая подготовка должна сохранить
raw квитанцию `base-open` и её документ/workflow, проверить шесть сохранённых GUID
и связи, затем повторно выполнить узлы в порядке зависимостей без перенастройки.
Для календаря/группировок/фильтра parameters={}, mappings=[], inputs=[];
для импорта сохраняется исходная source reference и settings={}. Отдельные чтения
сохранённых настроек допустимы только здесь, не добавляются в обычный Hermes-путь.
Пустая ветка также выполняется и сверяется полностью; cached output не принимается.

Файл `diagnostics.json`: `session_directory`, `graph_browser_file` (сырой ответ graph observe после base-open), `operations` (все шесть русских
имён узлов → operation_id), `files` (имя execution-events.jsonl/public-api.jsonl
и каждого browser-*.json → SHA256). Аудитор проверяет raw configuration против
исходной, новые execution IDs, полные свежие значения, отдельную сессию и отсутствие
дополнительных сохранений/перенастройки. Эта форма ещё не прошла новый сквозной live
прогон на финальном runtime; при интеграции её надо проверить до Hermes, не считать
старый dcb→cef прогон подтверждением новой fixture и нового полного аудитора.

Существующий диагностический harness, автоматически делающий SaveAs-копию,
не подходит для этого direct-open протокола без отдельной подготовки. Если вместо
него явно выбирается SaveAs/reopening, это отдельное согласованное действие и
включается dependency владельца12. Известный переход overwrite_confirmed →
packages.close cardinality0 расследуется у12; sticky mask не установлена причиной.
Параллельный ремонт здесь не выполнялся.

## Матрица admission

| Gate | Сейчас | Что требуется для закрытия |
| --- | --- | --- |
| ТЗ, локальные bytes, independent expected | prepared / checked | 248 файлов inputs inventory, независимый пересчёт |
| Полный аудитор и guarded launch scaffold | prepared / unit checked | Новый raw/live end-to-end после интеграции |
| N13-R3 | closed ранее | Fix commit ed53b018, не переоткрывается |
| R1_configure_positive | OPEN | Настоящая потеря ответа и продолжение configure прежнего ID |
| R1_configure_negative | OPEN | Отказы на чужом owner, иной матрице, отсутствующих receipt/draft |
| R2_terminal_live | OPEN | Разрешённая интеграция14 и реальная terminal failure Date/time с cleanup |
| targeted_regression | OPEN на будущем runtime | Ранее согласованные Done/Close, add/remove, ограничения/negative checks; отдельно от Hermes |
| isolated_environment / runner_adapter | OPEN для final candidate | test-3, storage, собственные profile/source; model-free candidate preflight и direct-open diagnostic |
| source/archive/catalog_readback | OPEN | Разрешённая интеграция, точные финальные pins, архив и verified candidate; старый diagnostic catalog не подходит |
| coordinator_slot | OPEN | Реальная отдельная команда, run_id, бюджет, Sol/low |
| save_as_node12 | Не применяется при direct_existing | Обязателен при явно выбранном save_as; общий repair здесь не реализуется |
| Hermes full goal + independent persistence | NOT RUN | Полный аудит всего нового declared scope после закрытия допуска |

## Точный configure continuation contract R1

Общий input_mapping-образец14 и readReceipt сами по себе этот gate не закрывают.
Контракт из [fix report](node-13-fix-1.md) остаётся обязательным:

1. Исходные operation_id, handler revision/signature, pending configure,
   внутренний gesture ID, **исходная** квитанция и наблюдения. Точные document,
   workflow, node, стадия wizard, выбранное поле и его native record ID.
2. Полная матрица **29 строк каждого поля**, включая func/ISO, first/last/number/
   string и StringFmt. Восстановить принятые шаги и полный исходный план;
   проверить одно ожидаемое изменение и отсутствие посторонних. Count не доказательство.
3. Исторический SUCCEEDED недостаточен без живой сверки owner/matrix и cleanup.
   Чужой owner, иной/пропавший draft, незавершённая квитанция или расхождение — отказ.
   Не сбрасывать pending, не повторять неопределённый click, не начинать новый ID.
4. Фазовый verifier в общей точке inspect/resume принимает ту же квитанцию один раз
   и продолжает оставшиеся шаги под **тем же operation_id**, deadline/recovery budget.
   Точное API имя определяет владелец14; отсутствующий API здесь не включён.
5. Один флаг не завершает configure: другие поля, Next, inline output mapping и
   validation должны закончиться; восстанавливаются driver-local configured/
   preconfiguration для последующих фаз. Нужны реальные positive и negative проверки.

R2 остаётся source/model finding: новой живой Date/time failure пока не доказано.
Интеграция общей terminal-failure обработки требует отдельного разрешения и живой
проверки именно Date/time. Никаких cherry-pick/merge/дублирования общей части нет.

## Проверки и ограничения результата

Полный Python suite: **531 PASS** (519 прежних + 12 новых). Новые проверки:
независимо перечисленные суммы/границы/NULL, frozen schema и exclusions,
неполные/искажённые source rows, full read на 12/0 строках без магического 10,
отказ summary-only аудитору, недопуск пустых/фиктивных gate receipts и gate перед
авторизацией/runtime setup. Прикладной inputs-check PASS, guarded pending-launch
ожидаемо заблокирован. Последний smoke указан в `unavailable:artifact-3cf421c0f3581e29`.

Новые fixture/goal/full auditor **ещё не прошли live/Hermes**. Предыдущие свежие
4×27 и persistence на dd0979bf относятся к fix round и не переименованы в результаты
этой подготовки. Final runtime/source/archive/catalog pins не назначены. Сборка,
stage, push/deploy/activation, общий плагин, новый review и следующий узел не запускались.
OpenViking healthy, shared actor memory прочитана; routing/hooks не менялись.

## SHA-256 подготовленных входов

Все пути ниже относительно `unavailable:artifact-6c9840df3f4b6129`. `inputs.json` фиксирует
полную зависимость аудитора: все локальные .py/.mjs, цель, CSV, expected и pending
шаблон; это не client runtime pin и не source archive. После разрешённых изменений
общих файлов inventory нужно осознанно перефиксировать и повторно проверить.

| Файл | Байты | SHA-256 |
| --- | --- | --- |
| `goals/date-time-sales.txt` | 7001 | `75149899dc376cfe731b190f17295f1361f43e2c47ad175b173b3fea40e48402` |
| `fixtures/date-time/sales.csv` | 505 | `eaab104ae50a47ecc3757d7dcc6d10ff8547519b85cae10eee324e4209905ed9` |
| `fixtures/date-time/expected.json` | 27272 | `dd40a49fcbf64306c0dc0af156aadd5921afc4d714949bb020afb0ebeb1a4c45` |
| `date_time_sales_acceptance.py` | 15048 | `452f427cac8790fdb212384ded0f80b0bbc7339c0f964bda4e85d5e6de51cb32` |
| `date_time_goal_evidence.py` | 9666 | `e5ec7ee6beedcc5823ece0407d05b03b7c6bc7ae275c65d12a82ee9ac5ac0704` |
| `date_time_admission.py` | 7902 | `f7d21123d15eb2b42d83f840d9b621bf927146a34b87b25b3f681bb4eb38d198` |
| `date_time_launch.py` | 3203 | `ac8a652058061c63f4d19b6ebd290804925c30ff0201e6872342fa5b4f0756d8` |
| `fixtures/date-time/inputs.json` | 25172 | `4e9dd42d71994f9642c012718c742c306bcb2893ae839e8fd9d8b61272a97743` |

Сводный SHA256 отсортированных строк `path:sha256\n` всех 248 inputs:
`c33909620601bebb091fd6047c148f463ef6af9a020364dd4822b11bf16e4351`.

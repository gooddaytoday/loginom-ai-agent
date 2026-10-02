# Разбиение на множества: подплан обработки

Статус подготовки: **documentation_complete**. Статус полного контракта: **discovery_required**.
Автор: Codex, 2026-10-01. Component ID: `component.preprocessing.DataPartition`.
Runtime type: **proposed** `preprocessing.data_partition`.
База `loginom`: `9b17e7dd947c016395e8e32e439ca775b1cbe780`.
Версия/редакция/платформа будущей приёмки фиксируются в её отчёте; сейчас Loginom не открывался.

## Результат и границы

Добавить один обработчик создания и перенастройки DataPartition со всеми доступными
методами и чтением трёх выходов. Runtime управляет штатным компонентом Loginom, не
воспроизводит его PRNG. Случайная выборка проверяется независимыми инвариантами и
воспроизводимостью, а не заранее придуманным набором RowID.

Документ завершён по поручению владельца без отдельного живого исследования. Его
неуточнённые native детали являются адресными пунктами реализации ниже; новые задачи
подготовки и вопросы выбора алгоритма владельцу не требуются. Сокращать объём до одного
режима из прежнего `initial_scope` нельзя.

## Источники и наблюдения

| Утверждение | Источник | Версия / дата | Уровень доказательства |
| --- | --- | --- | --- |
| Методы, размеры, приоритет, seed и три роли выхода | [Loginom Help](https://help.loginom.ru/userguide/processors/preprocessing/partitioning.html) | Прочитана 2026-10-01; версия страницы не указана | Документация |
| Runtime handler отсутствует; текущий reader ограничен 0/1 | `client/lib/node-support.mjs`, `node-api.mjs` пакета `packages/loginom-runtime` | Базовый SHA | Проверено чтением кода |
| Маленькие данные и schema profiles | [acceptance/data](acceptance/data), исходный doc SHA `df7a0595441e2fe7123f0132b8299b09e1a27f84` | Сохранённая подготовка | Только fixtures; прежний live/PASS не наследуется |
| Counts, сохранность occurrence и независимая арифметика | [expected.json](acceptance/expected.json) | Офлайн-пересчёт этой ветки | Математика / требования |

## Входы, выходы и семантика

Вход — одна таблица. Выходные роли: `combined`, `training`, `test`.
Combined содержит выбранные для обеих выборок occurrence и boolean-признак membership:
true для test, false для training. Training/test сохраняют исходные поля. Строки,
не выбранные ни в одну выборку, не обязаны находиться в combined. Пустой выход сохраняет
схему. Роли подтверждаются по native порту; индексы 0/1/2 являются предлагаемым mapping
по порядку Help, а не проверкой конкретной инсталляции.

Для каждого occurrence сохранить source RowID и полный payload, включая typed NULL,
empty string, boolean, datetime, real и большие integers. При bias RowID может повторяться;
использовать Counter, а не set. Combined membership согласуется с двумя отдельными выходами.
Техническое имя и расположение membership, реакция на коллизию с входным полем,
точные types/labels/data_kind/order должны быть закреплены реализацией.

### Методы и предлагаемые параметры

Все перечисленные API-поля — проектирование handler, не документированный API Loginom.

| mode | Полный набор настроек | Что проверять |
| --- | --- | --- |
| `random` | Размеры, приоритет, seed | Counts/provenance; одинаковый fixed seed и вход повторяются |
| `uniform` | То же + `uniform.group_size` | Параметр размерности групп; состав групп и остаток уточнить, не заменять strata |
| `stratified` | То же + `stratified.fields` | Одно/несколько полей, составные ключи, неравные страты и NULL |
| `sequential` | То же + `sequential.take`, `sequential.skip` | Блоки отбора/пропуска и порядок; не выдавать обычный contiguous split за все режимы |
| `biased` | То же + `biased.field`, typed `adjustments` | Каждый unique value, factor либо явный count; сокращение и увеличение частоты |

Общие параметры:

- `training` и `test`: `{unit: rows|percent, value}`. Rows — integer ≥0;
  percent — finite 0..100. Смешанные units разрешены проектом API.
- `priority`: training|test; `test_position`: algorithm|start|end. Start/end применяются
  только к test priority; не менять скрыто неактивную настройку при training priority.
- `seed`: `{policy: fixed, value: positive_integer}` либо `{policy: always_random}`.
  `generate`/`copy` в Help — команды мастера, не новые методы сэмплинга.
- Для нового узла все значимые настройки обязательны. Для existing patch сохраняет
  непереданные настройки; смена mode требует полный method-specific блок.
  Runtime не полагается на неизвестные native defaults.
- `group_size` и `take` — positive integer, `skip` — nonnegative integer;
  `stratified.fields` — непустые уникальные существующие technical names.
  Bias typed keys уникальны; count и factor взаимоисключающие, неотрицательные finite.
  Native верхние границы и допустимость нулевых коэффициентов проверить в реализации.

Документация задаёт остаточное формирование второй выборки при превышении общей
вместимости. Поэтому API не должен безусловно запрещать training+test>N.
Для N=12 и запросов 9/9 первым приоритетным набором являются 9 строк, вторым — 3.
Для процентов с дробным результатом не фиксировать floor/round/ceil без основания.
Для bias отдельно установить, до или после изменения частот считается база процентов.

NULL в группировке не объединять со строкой `NULL`. Недокументированные правила
квот strata/uniform и порядка случайной выборки не подменять удобными предположениями.
Seed reproducibility проверять также после save/cold reopen; другой seed не обязан
менять результат маленькой таблицы.

## Реализация и зависимости

Общая часть: [контракт](../../contracts/documentation-based-acceptance.md).
Node-specific будущие файлы: `packages/loginom-runtime/client/lib/datapartition-node.mjs`,
`datapartition-parameters.mjs`, `datapartition-procedure.mjs`; адресные тесты в `client/test/`.
Регистрация/schema/read общего кода вносится одним владельцем. Принятого dependency SHA
нет: эта ветка содержит только документы.

Этапы исполнения реализации:

1. Typed validation без UI эффектов; связать input и owned node/port identities.
2. Настроить метод и общие параметры штатной процедурой; проверить effective readback
   каждого активного поля; учесть деактивацию уже выполненного узла.
3. Finish/Execute; дождаться одного owned completed execution. Если мастер требует
   дополнительного обучения, поддержать его по фактическому контракту, не придумать train flag.
4. Прочитать полностью все три выхода, fresh schemas и membership; вернуть explicit coverage.
5. Поддержать повторное выполнение/чтение original source_operation_id после смены источника
   без пересоздания/настройки DataPartition; save — отдельная операция после успешного read.

## Ошибки и восстановление

До эффекта отклонять неизвестное поле/метод, дубли ключей, invalid size/seed, NaN/Infinity,
невалидный typed bias, несовместимые method blocks. Поля не выбирать по неоднозначному label.
Не превращать native residual allocation в ложную ошибку overflow.

После неизвестного ответа сверить текущую operation/graph/settings/execution; не создавать
новый узел или повторную операцию вслепую. Cancel до Finish сохраняет прежние настройки;
неудачный Execute сохраняет FAIL отдельно. Для recovery исправить источник/настройку
на том же графе, повторить, прочитать все выходы, сохранить и проверить cold.
Закрытие браузера не доказывает logout/package cleanup. Сейчас эти действия не выполняются.

## Проверки и независимые ожидаемые результаты

Полная матрица: [cases.json](acceptance/cases.json). 80 core combinations:
5 методов × 4 пары units × 4 стратегии (training; test algorithm/start/end), плюс
отдельные edge/group/bias/seed/type/dynamic/recovery проверки. Неприменимые параметры
имеют отрицательный случай, а не скрытый пропуск режима.

| Требование | Fixture / проверка | Независимый результат | Основание |
| --- | --- | --- | --- |
| Random, rows, fixed seed | base.csv; train6/test3, seed17; 2 повтора и cold | Counts 6/3/9, исходный payload; один результат replay, не фиксированный PRNG | Арифметика, Help seed |
| Units и overflow | base.csv; 50%/25%; 9/9 с обеими priorities | 6/3; 9/3 либо 3/9 | [expected](acceptance/expected.json) |
| Положение test | base.csv; test3, start/end | Test IDs 1,2,3 либо 10,11,12 в исходном порядке | Документация + RowID |
| Uniform | base.csv; group dimensions1/3/5, uneven.csv | Provenance/total counts; квоты остатка фиксируются отдельно | Параметр групп не равен strata fields |
| Strata | strata.csv; Group и Group+Subgroup | Независимые source group counts; NULL отличается от literal NULL | CSV + Counter |
| Sequential | base.csv; take2/skip1 и take12/skip0 | Независимая модель блоков как различающий контроль; точный native порядок сверить | Doc mode; model не golden native |
| Bias | bias.csv; factor0/1/2, explicit counts, дробный factor | При математической репликации A4→8; полная кратность/payload; rounding и размерная база отдельно | Не требовать unique output RowID |
| Пустой/малый/zero/full | empty.csv, tiny.csv, uneven.csv; 0/100%/N | Полные пустые schemas; устойчивые sizes, дробные доли — separate rule | Не угадывать rounding |
| Types/collision | typed.csv и вход с field `test_set` | Сохраняются все typed payload; явная стратегия коллизии | Independent import profile |
| Dynamic values/width/metadata | changed.csv; schema-added.csv; schema-metadata.csv | Original IDs/S сохраняются; реальные новые значения и schema | [profiles](acceptance/data/schema-profiles.json) |
| Invalid/recovery | seed0, negative size, unknown field; lost reply/cancel | Отказ до эффекта; correction/same-graph success/save/cold | Описанный lifecycle |

Oracle сравнивает все три роли, каждую клетку или строго определённый sampling invariant,
схему, origin counts, multiplicity и обещанный порядок. Требование disjoint/count≤1
распространяется на обычный отбор только после закрепления его семантики; bias не ограничен
им. Не принимать любую альтернативу rounding или «похожие количества» как PASS.

## Задание CLI и приёмка

[Бизнес-задание](acceptance/task.md) содержит цель, вход и `{{PACKAGE_PATH}}`, без oracle
и внутренних инструментов. Будущая модель `openai/gpt-6-sol`/low, CLI7200s. Expected и
математические расчёты изолированы. Общая baseline/dynamic/recovery/save/cold цепочка
описана в [общем контракте](../../contracts/documentation-based-acceptance.md).
Проверить настройки, связи, все выходы и сохранённый пакет без повторного configure.

## Критерии этапов

Документы: все методы и оси покрыты, ссылки/CSV/арифметика проходят офлайн-проверку.
Реализация: handler зарегистрирован, native aliases/ports/default policy уточнены,
адресные positive/negative проверки пройдены. Перед приёмкой заменить unresolved rules
одним подтверждённым правилом и заморозить independent expected. Принятый узел требует
полного public-path результата и независимого review текущего SHA. Сейчас всё исполнение
NOT_RUN, статус handler/readiness не повышается.

## Точка продолжения

Владелец каждого пункта — разработчик DataPartition при реализации; новых planning задач нет.

| Не определено документацией | Конкретная проверка / результат |
| --- | --- |
| Native technical names, типы/порядок портов и коллизия membership | Config/readback и все три schemas на typed.csv |
| Percent rounding, uniform remainder, strata quotas | N7 и неравные группы; зафиксировать один алгоритм до expected |
| Sequential block placement/order | take2/skip1, обе priorities и start/end; exact IDs |
| Bias rounding, before/after sizes, duplication | factor0/0.5/1/2 и counts на bias.csv, provenance всех выходов |
| Seed persistence и required train/apply | Same settings/input, save/reopen/execute; effective seed readback |

Подготовка подплана завершена; перечисленные проверки выполняются только в будущем
этапе реализации/приёмки по отдельному поручению, не в текущем документальном этапе.

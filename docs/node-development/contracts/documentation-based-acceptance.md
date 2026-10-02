# Общая реализация и приёмка трёх узлов

Спецификация от 2026-10-01, без изменения runtime. Применяется к
[трём подпланам](../three-node-plans.md). База `loginom`: `9b17e7dd`.

## Работа по планам

В этом поручении готовятся документы. Живое исследование не выполняется; правила,
не заданные Help, имеют конкретные проверки в узловых планах. Их уточнение относится
к реализации. Порядок: общий минимальный контракт → node-specific handlers → адресные
проверки → сборка → автономная CLI-приёмка → независимое review актуального SHA.
Не нужна новая компания, цепочка задач, сервис или дополнительный gate подготовки.

Единственный владелец общих файлов — будущий интегратор runtime. Разработчики узлов
владеют своими `*-node.mjs`, `*-parameters.mjs`/`*-procedure.mjs`, тестами и документацией.
При параллельной работе сначала согласовать общие parameter schemas и support dispatch;
затем интегратор вносит их одной правкой. Полные математические алгоритмы узлов исполняет
Loginom: runtime настраивает, запускает и читает, а независимый oracle проверяет результат.

## Необходимые общие правки

| Существующий файл | Требуемая работа |
| --- | --- |
| `packages/loginom-runtime/client/lib/node-support.mjs` | Регистрация трёх типов и драйверов, поддержка повторного чтения |
| `client/lib/node-api.mjs` того же пакета | Новые mode/parameters schemas; чтение порта 2 для двух трёхпортовых узлов; discovery отражает фактическую поддержку |
| `client/lib/node-read-contract.mjs` | Исходный `source_operation_id`, identity узла/графа/портов; разрешить проверенный пересмотр схемы только для поддержанного типа |
| `client/lib/node-read-driver.mjs` | Свежие execution и schema audit при изменении входа; не перенастраивать узел во время read |
| `client/lib/node-output-procedure.mjs`, `table-output-pages.mjs`, `table-output-values.mjs` | Прочитать все запрошенные порты, типы/NULL/порядок/precision; data_kind не выдавать за freshly observed при копировании cached metadata |
| `scripts/node-acceptance/cold-check.mjs` | Явная версия multi-output expected, независимые численные допуски и sequence/multiset/invariants; legacy формат сохранить |
| `scripts/node-acceptance/accept-node.sh` | Выполнение обязательных сценариев с изолированными expected; сохранить лимит модели и существующий cleanup |

В pin apply/read ограничены индексами 0/1, cold-check читает один выход и сравнивает
числа точно. Уже существующие integer-string/typed NULL, owner/precision guards и
динамика Sliding CrossTable сохраняются. Новую динамику нельзя получить удалением
static identity checks. GUID порта разрешается по owned node, не по случайному экранному
порядку; все выходы фазы принадлежат одному completed execution.

## Expected и observations

Узловые `acceptance/expected.json` сейчас **спецификации**, а не входы существующего
cold-check. Для будущего executable oracle выбрать явную версию; не пытаться угадать
формат по полям. Observation и expected — разные файлы.

Каждый scenario связывает input bytes/hash и import profile, requested/effective settings,
source SHA, package/workflow/node IDs, links, semantic role/index/GUID каждого порта,
полную schema и все строки, complete execution, save и cleanup receipts. Холодное
открытие использует тот же saved package, новый context и новое выполнение без configure.
Эфемерные UI refs не обязаны совпадать; сохранённый граф и настройки обязаны.

Schema: порядок, technical name, label, scalar type, data_kind и подтверждённая
nullable semantics. NULL отличается от empty/false/0/строки `NULL`. Integer64 и lag
сравнивать без преобразования больших integers в Number. Неизменённые payload — exact.
RowID — происхождение occurrence, не универсальный unique output key при bias.
Multiset сохраняет кратности; sequence сравнивает реальный порядок. Не сортировать данные
незаметно для теста. Фильтр отключён; полные маленькие fixtures помещаются в ограничения
reader. Пустой выход всё равно содержит identity/schema и проверяется.

Вычисленные finite real: `abs(actual-expected) <= atol + rtol*abs(expected)`.
Для малых well-conditioned примеров стартовый профиль `atol=rtol=1e-12`, с проверкой
формулы и 17 значащих цифр reader. Он не применяется к payload, integer/count/lag и
не повышается после ошибки. NaN/Infinity не принимаются вместо установленных NULL/error.
Для ill-conditioned данных отдельно обосновать допуск; иной denominator или tau-a
не является погрешностью tau-b.

## Обязательные проверки общего кода

- Synthetic три порта с пустым выходом, точными typed rows и integer64 `9007199254740993`.
- Ordered expected `[2,1,2]`, actual `[1,2,2]`: FAIL; тот же multiset: PASS.
- Metadata/category/label mutation: сначала три поля A, затем шесть B; отдельно B→C
  сохраняет **шесть** полей и меняет label/data_kind/category. Те же IDs и исходный S.
- Ошибочные порт, schema, значение, NULL, потерянный или лишний occurrence, stale execution,
  фильтр/неполный read и cached schema дают отказ, даже при прежних итоговых counts.
- Диапазон tolerance: expected0/actual5e-13 PASS, actual2e-12 FAIL; expected1/actual1+3e-12 FAIL.
- Реальный failure → коррекция на том же графе → успешный read → save → независимый cold.
  Административное закрытие сессии само по себе не является восстановлением результата.
- Старые single/two-port handlers и Sliding CrossTable проходят адресную регрессию.

## Будущая бизнес-приёмка

Бизнес CLI получает только цель, разрешённые входы и уникальный `{{PACKAGE_PATH}}`.
Expected, расчёты, research и oracle остаются вне его workspace. Модель
`openai/gpt-6-sol`, reasoning low, timeout CLI 7200 секунд по действующему RUNBOOK.
Смена узла или общего кода требует нового source SHA/build и проверки затронутого scope.

Во всех трёх узлах: baseline → source values mutation → новый public read с original S
→ width mutation → metadata/category/label mutation при той же ширине → public read
→ исправление воспроизведённой ошибки → save после последнего read → close/logout
→ independent open/execute/read всех портов без configure → cleanup. Сценарии, недоступные
из-за ещё не реализованной возможности, отмечать NOT_RUN; не выдавать partial PASS за
готовый узел. Snapshot Loginom не заменяет независимый математический expected.

Эти требования описывают будущее выполнение. В текущем поручении они NOT_RUN,
Paperclip-агенты и живой Loginom не используются.

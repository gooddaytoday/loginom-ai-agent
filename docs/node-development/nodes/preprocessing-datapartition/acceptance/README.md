# Разбиение на множества: спецификация приёмки

Этот комплект подготовлен офлайн. Native execution, CLI acceptance и cold reopen
**NOT_RUN**. [Подплан](../plan.md) — основной документ; JSON не является receipt узла.

## Входы и цели

CSV в `data/` используют comma и UTF-8; `?` обозначает typed NULL только при указанном
профиле импорта, строка `NULL` остаётся строкой. RowID всегда переносится в output
как исходное значение, включая кратные occurrences при bias.
[schema-profiles.json](data/schema-profiles.json) задаёт входные типы/метки/вид,
не независимые ожидаемые результаты. В typed.csv проверить integer64, datetime,
empty string/NULL, real precision и коллизию membership с test_set.

[cases.json](cases.json) содержит 80 core settings и дополнительные edge cases.
Core проверяет 5 modes × 4 пары units × 4 стратегии приоритета/положения test.
Fixtures base/strata/bias выбираются по методу, а не подменяют друг друга.
Каждый запуск получает уникальный путь `/AI/DataPartition/{{CASE_ID}}-{{RUN_ID}}.lgp`.
`task.md` — шаблон бизнес-задания; координатор приёмки подставляет выбранную цель,
размеры, метод и вход без передачи expected.json или oracle исполнителю CLI.

## Independent oracle

[expected.json](expected.json) задаёт exact counts там, где нет rounding ambiguity,
исходные group counters, start/end test IDs и различающие hypotheses.
Random selection IDs и алгоритм PRNG не выдуманы. Для метода без репликации проверять
отсутствие дублей только после подтверждения этой семантики. Для biased всегда
проверять Counter(RowID,payload), не множества уникальных ID.

После выбора native правил квот/rounding/bias базы заморозить один oracle до запуска.
Нельзя принимать «совпал один из вариантов». Combined membership и отдельные train/test
сопоставляются по каждому occurrence; source payload, typed NULL и schema сравниваются
точно. Coverage полная по всем трём портам; sample/preview не являются приёмкой.

Повторяемость проверять при fixed seed на той же настройке, при повторном чтении и
после самостоятельного cold reopen. Другой seed не обязан менять малый результат.
Контрольные искажения: неверный membership, подмена train/test портов, потеря RowID,
лишняя/потерянная кратность, испорченный payload, field label/kind, NULL→empty string,
перестановка при договорённом порядке. Каждое искажение должно дать FAIL.

## Граф, сохранение и проверка

Один source_operation_id и те же node/port IDs проходят source values/width/metadata
changes, failure repair и save/cold. [Общий контракт](../../../contracts/documentation-based-acceptance.md)
задаёт полный public path и сохранение доказательств. Expected/oracle остаются вне
CLI workspace. Будущая модель Sol/low, CLI limit7200s; сейчас запуска нет.

Проверка офлайн из repo root: `python3 docs/node-development/check-three-node-plans.py`.
Она сверяет frozen JSON, SHA CSV, покрытие и ручные математические опоры трёх узлов;
не доказывает native contract или node PASS.

## Precision and actual membership collision fixture

`data/typed-int64-collision.csv` and `typed-int64-source-expected.json` are independently
written source payload, not native output expected. Native execution: **NOT_RUN**.
The fixture adds positive/negative int64 boundaries, typed NULL versus empty/literal NULL,
boolean, real, full datetime milliseconds and an incoming string `IsTestSet`.
Integer payload comparison uses exact decimal strings; real payload is exact.
The datetime import profile and native membership collision strategy must be proved before
this becomes an acceptance case. Do not rename the input to avoid the collision or infer
a membership name from the output under test.

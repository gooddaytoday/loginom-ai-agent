Предложение критериев LAB-533 для утверждения владельцем до этапа1.
Только последовательный метод; смещение исключено из v0.3.8.

`python3 oracle.py --case CASE` независимо строит expected из fixtures/ срезами
Python и конкатенацией; не читает Loginom/runtime/actual. Без аргументов —
expected.json; CASE null/empty/update — expected-CASE.json. [Матрица](matrix.md).
ordered=true, явный output_port, точный порядок строк/полей, типы и NULL;
real abs=0/rel=0, integer/string/boolean сравниваются точно.

Основные выходы подтверждены native UI и stock matchesExpectedOutput.
**NULL/empty — проверяется на этапе 1 по oracle**, по решению LAB-533;
это оговорка завершения этапа 0, а не PASS. Четыре короткие попытки не дали
подтверждённого чтения выходов. Генерация expected не доказывает поведение
продукта. Update/cold NOT_RUN. Модель получает только
task.md и нужные CSV; oracle/expected/discovery не передавать.
Запуск — штатный run-check; своего раннера нет. Runtime type не зарегистрирован,
этап0 запрещает сборку CLI. Модельный PASS не заявлен.

Sequential: train_count/test_count в строках, порядок test → train → unused.
Скрытые cntTestPriority/pedTestPriorityPosition не входят в последовательный контракт.
Native engine TBGPartitionEngine подтверждён сохранённым XML.

| output_port | Наблюдённый результат rows.csv | Строки | Сумма Value |
|---|---|---:|---:|
| 0 общий | IsTestSet boolean первым, RowID6..15 затем1..5 | 15 | 1200 |
| 1 train | RowID6..15, исходные3 поля | 10 | 1050 |
| 2 test | RowID1..5, исходные3 поля | 5 | 150 |

IsTestSet label «Тестовое множество», false для train, true для test.
Поля train/test: RowID integer, Class string, Value integer. Unused16..20
не входит ни в один выход. Общий выход concat train+test; глобальный порядок
входа не сохраняется, порядок внутри каждого множества точный.
Предложенный order train_test_unused ещё требует отдельной проверки до реализации.

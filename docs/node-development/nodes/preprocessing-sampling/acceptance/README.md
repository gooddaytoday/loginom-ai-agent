Предложение критериев LAB-533 для утверждения владельцем до этапа1.
Только последовательный метод; смещение исключено из v0.3.8.

`python3 oracle.py --case CASE` независимо строит expected из fixtures/ срезами
Python и конкатенацией; не читает Loginom/runtime/actual. Без аргументов —
expected.json; CASE null/empty/update — expected-CASE.json. [Матрица](matrix.md).
ordered=true, явный output_port, точный порядок строк/полей, типы и NULL;
real abs=0/rel=0, integer/string/boolean сравниваются точно.

Основные выходы подтверждены native UI и stock matchesExpectedOutput.
NULL/empty не проверены из-за трёх потерь связи стенда. Генерация expected
не доказывает поведение продукта. Update/cold NOT_RUN. Модель получает только
task.md и нужные CSV; oracle/expected/discovery не передавать.
Запуск — штатный run-check; своего раннера нет. Runtime type не зарегистрирован,
этап0 запрещает сборку CLI. Модельный PASS не заявлен.

Sequential: count в строках, position first/last; sampled → unused либо наоборот.
Выход0: first RowID1..5 / last16..20, по5 строк, суммыValue150/900.
Новый узел сохраняет RowID integer, Class string, Value integer и их порядок.
Старый mapping после смены biased→sequential может сохраниться; не сбрасывать
незапрошенные настройки. Native engine TBGSamplingEngine подтверждён сохранённым XML.
Смещение исключено из v0.3.8 текущим решением; наблюдение 10 строк вместо
гипотезы14/seed42 сохранено в discovery, раздел «Следующие этапы».

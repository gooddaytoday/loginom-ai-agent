# Независимые диагностические проверки Collapse Columns

`fixtures/types.csv` содержит явно разные integer1 / real1.0 / string"1",
real17значащих цифр, integer2147483647, Date с ненулевыми миллисекундами,
boolean, пустую строку и Null. Типы при импорте задаются оператором явно;
CSV сам по себе не переносит native-типы. I/S получают одинаковую метку.

`expected.json` написан независимо от handler. `audit_diagnostic.py` проверяет
полный configuration/readback, принадлежность квитанций, порядок ролей,
сопоставления/исключения, ограниченную выборку и честное ограничение variant.
На каждом реальном результате затем выполняются отрицательные подмены.
Нельзя трактовать PASS этого диагностического аудитора как полный финальный
аудит узла: exact_variant_acceptance всегда BLOCKED до отдельного read-контракта.

Пример:

```sh
python3 tools/loginom-acceptance/collapse/audit_diagnostic.py RESULT.json \
  --operation OPERATION_ID --node NODE_GUID --executed --ignore-empty
```

Сохранение пакета проверяется отдельным открытием/наблюдением; аудитор не
подменяет persistence локальным checkpoint. Hermes не запускался. Итоговый
автономный аудитор и естественное ТЗ потребуют согласованного exact variant_io.

`audit_persistence.py BEFORE_GRAPH AFTER_GRAPH SAVE_RESULT EMPTY_RESULT OPERATION_ID`
сравнивает node/port/link IDs цепочки, подтверждение сохранения, разные document IDs
сессий, полный вход и пустой выход; выполняет12отрицательных подмен.
Дополнительный третий аргумент `audit_edge_cases.py empty` задаёт ожидаемый
operation ID, не изменяя исходный результат.
Для существующей свёртки upstream должен быть активен: после нового открытия
сначала выполнить источник. Неактивный источник получает ранний NOT_APPLIED,
без входа в мастер и без автоматического удаления связей.

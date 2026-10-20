## r3: Прогноз новых значений

Продолжение [исходного задания этапа 1](../../../../../node-development/nodes/datamining-linregression/acceptance/task.md)
в том же чате и сохранённом пакете. Это независимая ветвь от полностью
выполненного исходного задания, а не продолжение другого r.
Модели отправить [prompt.md](prompt.md). Вместе с просьбой приложить только новый [holdout.csv](../../../../../node-development/nodes/datamining-linregression/acceptance/data/holdout.csv); train.csv повторно не прикладывать.
Oracle, expected и этот README модели не передавать.

Что меняется: Применить исходную модель к двум новым строкам, не включая их в обучение; переименовать прогноз в Forecast и оставить три столбца.

Исходные CSV: [train.csv](../../../../../node-development/nodes/datamining-linregression/acceptance/data/train.csv), [holdout.csv](../../../../../node-development/nodes/datamining-linregression/acceptance/data/holdout.csv). Все данные синтетические, UTF-8, заголовок,
разделитель-запятая, десятичная точка. Oracle читает файлы относительно своего
расположения, использует только стандартную библиотеку Python и не читает
expected, соседние oracle, пакеты или результаты Loginom.

Oracle заново независимо вычисляет OLS с константой на train.csv через Fraction (Y=3+2X), затем прогнозирует holdout.csv: RowID 7/8, X 4/5, Forecast 11/13. Значения Y="?" в holdout — NULL, IsTest=true; они не становятся целевыми значениями обучения. Допуск только Forecast: abs=1e-8, rel=1e-10. Статическая проверка значений сама по себе не доказывает отсутствие скрытого переобучения; это намерение просьбы.

Полный итог: 2 строки в [expected-demo.json](expected-demo.json).
`column_order: exact` закрепляет порядок полей, указанный в просьбе;
`ordered: false` допускает любой порядок строк.
`nodes` требует основные типы без ограничения дополнительных узлов.

Пакет-шаблон: `/stability-2026-10-20/datamining-linregression.lgp`.
Точное назначение CSV-шаблона: `/stability-2026-10-20/forecast-new.csv`.
При исходном задании подставить этот же путь пакета вместо `{{PACKAGE_PATH}}`.
Оба абсолютных пути — шаблоны: перед будущим прогоном заменить их на личные,
а имена CSV из просьбы разрешить рядом с фактическим пакетом.
Старые экспорты допустимы: итоговый `export_input` выбирается по точному
`export_destination`, который должен совпасть с полным назначением нового CSV.

Из корня репозитория (без аргументов — побайтное воспроизведение эталона):

```sh
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r3/oracle.py
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r3/oracle.py /my-account/scenario.lgp /my-account/forecast-new.csv
```

Первый аргумент меняет только `package_path`, второй — только
`export_destination`; передавайте полный путь CSV, даже если пакет и CSV
хранятся в разных каталогах. Oracle работает из любого текущего каталога.
Для проверки JSON используйте `parseExpectedOutputs` из
`scripts/node-acceptance/expected-outputs.mjs` после подстановки личных путей.
Генерация и проверка ожидаемых таблиц не являются native/model/cold PASS;
живые и модельные прогоны в LAB-101 не выполняются.

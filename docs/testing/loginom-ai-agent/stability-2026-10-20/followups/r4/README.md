## r4: Переобучение на замене

Продолжение [исходного задания этапа 1](../../../../../node-development/nodes/datamining-linregression/acceptance/task.md)
в том же чате и сохранённом пакете. Это независимая ветвь от полностью
выполненного исходного задания, а не продолжение другого r.
Модели отправить [prompt.md](prompt.md). Вместе с просьбой приложить только новый [replace.csv](../../../../../node-development/nodes/datamining-linregression/acceptance/data/replace.csv); train.csv повторно не прикладывать.
Oracle, expected и этот README модели не передавать.

Что меняется: Заменить исходный train.csv, явно переобучить модель и выгрузить прогнозы для шести строк новых обучающих данных.

Исходные CSV: [replace.csv](../../../../../node-development/nodes/datamining-linregression/acceptance/data/replace.csv). Все данные синтетические, UTF-8, заголовок,
разделитель-запятая, десятичная точка. Oracle читает файлы относительно своего
расположения, использует только стандартную библиотеку Python и не читает
expected, соседние oracle, пакеты или результаты Loginom.

Oracle независимо вычисляет OLS с константой на replace.csv через Fraction: Y=7−3X, прогнозы 13, 10, 7, 4, 1, −2. Старые прогнозы Y=3+2X не подходят ни для одной строки. Допуск Forecast: abs=1e-8, rel=1e-10; RowID и X точные. Коэффициенты и диагностика модели не входят в эту итоговую таблицу.

Полный итог: 6 строк в [expected-demo.json](expected-demo.json).
`column_order: exact` закрепляет порядок полей, указанный в просьбе;
`ordered: false` допускает любой порядок строк.
`nodes` требует основные типы без ограничения дополнительных узлов.

Пакет-шаблон: `/stability-2026-10-20/datamining-linregression.lgp`.
Точное назначение CSV-шаблона: `/stability-2026-10-20/forecast-refit.csv`.
При исходном задании подставить этот же путь пакета вместо `{{PACKAGE_PATH}}`.
Оба абсолютных пути — шаблоны: перед будущим прогоном заменить их на личные,
а имена CSV из просьбы разрешить рядом с фактическим пакетом.
Старые экспорты допустимы: итоговый `export_input` выбирается по точному
`export_destination`, который должен совпасть с полным назначением нового CSV.

Из корня репозитория (без аргументов — побайтное воспроизведение эталона):

```sh
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r4/oracle.py
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r4/oracle.py /my-account/scenario.lgp /my-account/forecast-refit.csv
```

Первый аргумент меняет только `package_path`, второй — только
`export_destination`; передавайте полный путь CSV, даже если пакет и CSV
хранятся в разных каталогах. Oracle работает из любого текущего каталога.
Для проверки JSON используйте `parseExpectedOutputs` из
`scripts/node-acceptance/expected-outputs.mjs` после подстановки личных путей.
Генерация и проверка ожидаемых таблиц не являются native/model/cold PASS;
живые и модельные прогоны в LAB-101 не выполняются.

## r6: Ещё один параметр echo

Продолжение [исходного задания этапа 1](../../../../../node-development/nodes/integration-restrequest/acceptance/task.md)
в том же чате и сохранённом пакете. Это независимая ветвь от полностью
выполненного исходного задания, а не продолжение другого r.
Модели отправить [prompt.md](prompt.md).
Oracle, expected и этот README модели не передавать.

Что меняется: Сохранить исходный адрес https://httpbin.org/anything, добавить query-параметр Source=audience и выгрузить его вернувшееся значение.

Исходные CSV: [requests.csv](../../../../../node-development/nodes/integration-restrequest/acceptance/data/requests.csv). Все данные синтетические, UTF-8, заголовок,
разделитель-запятая, десятичная точка. Oracle читает файлы относительно своего
расположения, использует только стандартную библиотеку Python и не читает
expected, соседние oracle, пакеты или результаты Loginom.

Oracle без сети читает исходные две пары RequestId/Key и добавляет ожидаемый стабильный args.Source="audience" и HTTP 200. При исполнении все три строковых поля нужно получить из args ответа, HttpStatusCode — из фактического HTTP-результата; подстановка исходных полей и констант в итог вместо разбора ответа не выполняет просьбу. Не проверяются IP, даты, headers и trace id.

Все REST-колонки используют `label_any: true`: проверяются технические имена, типы и стабильные значения, без привязки к подписям.

Полный итог: 2 строки в [expected-demo.json](expected-demo.json).
`column_order: exact` закрепляет порядок полей, указанный в просьбе;
`ordered: false` допускает любой порядок строк.
`nodes` требует основные типы без ограничения дополнительных узлов.

Пакет-шаблон: `/stability-2026-10-20/integration-restrequest.lgp`.
Точное назначение CSV-шаблона: `/stability-2026-10-20/echo-source.csv`.
При исходном задании подставить этот же путь пакета вместо `{{PACKAGE_PATH}}`.
Оба абсолютных пути — шаблоны: перед будущим прогоном заменить их на личные,
а имена CSV из просьбы разрешить рядом с фактическим пакетом.
Старые экспорты допустимы: итоговый `export_input` выбирается по точному
`export_destination`, который должен совпасть с полным назначением нового CSV.

Из корня репозитория (без аргументов — побайтное воспроизведение эталона):

```sh
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r6/oracle.py
python3 docs/testing/loginom-ai-agent/stability-2026-10-20/followups/r6/oracle.py /my-account/scenario.lgp /my-account/echo-source.csv
```

Первый аргумент меняет только `package_path`, второй — только
`export_destination`; передавайте полный путь CSV, даже если пакет и CSV
хранятся в разных каталогах. Oracle работает из любого текущего каталога.
Для проверки JSON используйте `parseExpectedOutputs` из
`scripts/node-acceptance/expected-outputs.mjs` после подстановки личных путей.
Генерация и проверка ожидаемых таблиц не являются native/model/cold PASS;
живые и модельные прогоны в LAB-101 не выполняются.

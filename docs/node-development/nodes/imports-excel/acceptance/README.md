# Этап 0: независимый приёмочный комплект

Checkpoint исследования, **не product XLSX CLI PASS**. Статус и незавершённые проверки — в [discovery](../discovery.md). Fixtures созданы до handler; ожидания/manifest не передаются модели. Product task.md и integrated reader появятся на этапе 1 после принятия этапа 0.

`fixtures/manifest.json` фиксирует bytes/SHA256, происхождение и схему. XlsxWriter — writer, OpenPyXL — независимый reader; source и ожидания large дополнительно сверяются по арифметической спецификации в oracle. Amount кратен четверти, числа точно представимы. Полный порядок Id 1..20789 обязателен. NULL/empty/0/False не объединяются.

В отдельном Python environment установите pinned `requirements.txt`. Команды:

```sh
python oracle.py
python generate-fixtures.py --output /your/new-fixture-directory
python oracle.py --actual /your/full-warm.json --actual /your/full-cold.json \
  --node-id YOUR_EXACT_NODE_GUID \
  --server-source /your/warm-original-large.xlsx \
  --server-source /your/cold-original-large.xlsx
```

Generator воспроизводит девять обычных fixtures; генерируемый inventory не заменяет расширенный manifest этого checkpoint. `protected.xlsx` — frozen randomized msoffcrypto-tool 5.4.2 encryption book-a.xlsx, публичный fixture password `xlsx-fixture-only`; её bytes нельзя сравнивать с вновь зашифрованной книгой. На кандидате 81af protected проверен: runtime execution failure, точная ошибка записана в discovery. `corrupt.xlsx` намеренно не ZIP. Текущий обычный corpus детерминирован: fixed creation/ZIP timestamps, sorted ZIP entries; сравнивайте bytes с manifest.

`native-full-reader.mjs` — диагностическая функция, которую вызывает собственный harness с authenticated `page`. Она не создаёт соединение, не загружает файл и не выполняет продуктовый handler. Caller обязан самостоятельно проверить identity пакета/document/account, persisted settings и текущие server bytes, записать native process baseline **до** gesture, выполнить exact node и открыть exact output preview. Console history must show completed processes. Передать prefix, packagePath, nodeId, portGuid, baseline process IDs, rowCount и schema. Cookies/cache/history changes означают отказ, не частичный PASS. Начальная cache initialization должна закончиться до аудита. Не переносите cookies/receipts старого профиля в cold.

Функция возвращает все ordered rows `{is_null,value}`, schema и bound native execution. Прототип не доказывает atomic server snapshot, Product W1 admission или статическую Excel ancestry. Current oracle проверяет fixture hashes, все large cells/schema и выбранные малые cases; диагностический warm/cold harness — `native-package-audit.mjs`. Cleanup доказывается native package_closed/logged_out receipts отдельно от return code.


`expected-small-cases.json` хранит независимые typed cell ожидания, заданные до warm-аудитов новой попытки из canonical fixtures и явно закреплённых правил преобразования. Имя case задаёт source/region/blank/column selection; alias используют bytes канонического workbook/book-a, не отдельный writer. Наличие ожидания не означает выполненный native case: empty и named-fixed квалифицированы на fd02103c; финальные warm/cold результаты публикуются отдельно. Для воспроизведения малых аудитов передайте `--case-bindings bindings.json`; файл — массив `{ "case": "irregular.xlsx", "node_id": "EXACT_GUID", "actual": "warm-irregular.xlsx.json" }`, actual path относителен bindings. Node binding назначается до выполнения, не извлекается проверяющим из actual. Coverage, schema, all ordered values и точные JSON value types обязательны. Server SHA, persisted settings, fresh baseline и cleanup дополнительно проверяет caller.


`auditNativePackage(page, spec, outputDirectory)` из `native-package-audit.mjs` принимает уже авторизованную isolated page, exact свежие `prefix`/`tabTid` native open_package, username/packagePath/serverDirectory, prior graph `{id,label,x,y}` без edges, `portGuid`, cases `{label,file,nodeId,rowCount,schema,persisted}` и sources `{file,bytes,sha256}`. Все bindings получают до прогона из source manifest/независимых ожидаемых таблиц/предшествующего конфигурационного readback; не выводите ожидания из текущего actual. Alias mapping: blank-exclude/blank-stop/named-extend/named-fixed → canonical workbook bytes; manual/empty-schema → book-a bytes. Для другого reviewer аккаунта сначала создаётся его собственный corpus/package и фиксируются его собственные exact GUID/path bindings; чужая identity не переносится.

Caller проверяет чистый опубликованный SHA, candidate integrity, отдельный loginom status ready, pins обоих диагностических modules, создаёт новые attempt/profile/output и штатно открывает собственный пакет. В warm и свежем cold самостоятельно вызывается harness, без восстановления настроек и старых cookies/receipts. Output: `audit-<label>.json` со всеми native typed cells и свежим process binding, `server-<file>` с заново полученными original bytes, `package-audit.json` с before/after graph+SHA и `cleanup.json`. Независимый oracle запускается затем вне browser. Наличие output file до oracle/cleanup не означает PASS. При ошибке неизвестный эффект не повторять; сохранить попытку, штатно прочитать ошибку, подтвердить только свой cleanup либо восстановление по протоколу.

Persisted comparison uses source value/checked and all column settings; transient UI disabled flags are recorded, but are not persisted parameters. Initial 58f2747c audit stopped before node execution on a disabled-state race; its cleanup is confirmed and its result is not accepted.

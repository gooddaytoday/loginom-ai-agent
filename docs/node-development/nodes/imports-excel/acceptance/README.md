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

Generator воспроизводит девять обычных fixtures; генерируемый inventory не заменяет расширенный manifest этого checkpoint. `protected.xlsx` — frozen randomized msoffcrypto-tool 5.4.2 encryption book-a.xlsx, публичный fixture password `xlsx-fixture-only`; её bytes нельзя сравнивать с вновь зашифрованной книгой. Проверка protected native пока not_checked. `corrupt.xlsx` намеренно не ZIP. Текущий обычный corpus детерминирован: fixed creation/ZIP timestamps, sorted ZIP entries; сравнивайте bytes с manifest.

`native-full-reader.mjs` — диагностическая функция, которую вызывает собственный harness с authenticated `page`. Она не создаёт соединение, не загружает файл и не выполняет продуктовый handler. Caller обязан самостоятельно проверить identity пакета/document/account, persisted settings и текущие server bytes, записать native process baseline **до** gesture, выполнить exact node и открыть exact output preview. Console history must show completed processes. Передать prefix, packagePath, nodeId, portGuid, baseline process IDs, rowCount и schema. Cookies/cache/history changes означают отказ, не частичный PASS. Начальная cache initialization должна закончиться до аудита. Не переносите cookies/receipts старого профиля в cold.

Функция возвращает все ordered rows `{is_null,value}`, schema и bound native execution. Прототип не доказывает atomic server snapshot, Product W1 admission или статическую Excel ancestry. Current oracle проверяет fixture hashes и все large cells/schema; полный закрывающий stage-0 harness для малых случаев ещё не завершён. Cleanup доказывается native package_closed/logged_out receipts отдельно от return code.

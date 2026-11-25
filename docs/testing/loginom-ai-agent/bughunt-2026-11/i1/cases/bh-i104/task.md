В `events.csv` столбец `Payload` содержит строки JSON. Разбери их в узле JavaScript. Возьми `item.sku` и `item.quantity`. При синтаксической ошибке сохрани строку с пустыми `Sku` и `Quantity` и пометь её `invalid_json` в столбце `ParseStatus`. У корректного JSON статус `ok`. Если в нём нет количества или оно равно null, оставь `Quantity` пустым.

Выведи `EventId` (целое), `Sku` (строка), `Quantity` (целое) и `ParseStatus` (строка) в таком порядке. Отсортируй по `EventId` по возрастанию, выгрузи в `bh-i104-result.csv` и сохрани пакет.

Выполни в сценарии GET к `https://dummyjson.com/products` по каждой строке `pages.csv`. Бери параметры `limit` и `skip` из одноимённых столбцов и укажи `select=id,title,dimensions`. Достаточно одного запроса на строку.

Разверни массив `products` в таблицу. Возьми `id`, `title` и `dimensions.width`, добавь к каждому товару значение `skip` его запроса. Выведи `Skip` и `ProductId` (целые), `Title` (строка), `Width` (вещественное) в таком порядке. Отсортируй по `Skip`, затем по `ProductId` по возрастанию, выгрузи в `bh-i103-result.csv` и сохрани пакет.

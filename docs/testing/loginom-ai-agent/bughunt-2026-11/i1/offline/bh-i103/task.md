Настрой GET к `https://dummyjson.com/products` с имитацией ответа из приложенного `response.json`. Параметры `limit` и `skip` возьми из строки `pages.csv`, укажи `select=id,title,dimensions`. Запрос должен выполниться в режиме имитации.

Разверни массив `products` из ответа в таблицу. Возьми `id`, `title` и `dimensions.width`, добавь к каждому товару `skip` его запроса. Выведи `Skip` и `ProductId` (целые), `Title` (строка), `Width` (вещественное) в таком порядке. Отсортируй по `Skip`, затем по `ProductId` по возрастанию, выгрузи в `bh-i103-result.csv` и сохрани пакет.

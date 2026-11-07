Отправь каждую строку requests.csv в https://httpbin.org/anything отдельно методами POST, PUT, PATCH и DELETE. Для POST, PUT и PATCH отправь Body как тело с Content-Type application/json; у DELETE тела нет.
Покажи по каждому ответу метод, исходный RequestId, полученное сервисом тело и фактический HTTP-код. Имена столбцов: Method, RequestId, Body, HttpStatusCode. RequestId сохрани из исходной строки, Method и Body возьми из ответа.
Выгрузи все восемь результатов в methods-body.csv (UTF-8, запятая, заголовок) рядом с пакетом.
Сохрани сценарий в {{PACKAGE_PATH}}.

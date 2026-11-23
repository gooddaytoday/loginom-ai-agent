Отправь строки requests.csv методом POST в https://httpbin.org/anything, передавая Body как JSON-тело и заголовок X-Lab-Cycle со значением first.
Покажи вернувшиеся заголовок X-Lab-Cycle, тело и HTTP-код вместе с исходным RequestId: RequestId, HeaderValue, Body, HttpStatusCode.
На том же запросе поменяй только заголовок на second, покажи новые ответы и выгрузи окончательный результат в headers.csv с такими же столбцами. CSV: UTF-8, запятая, заголовок; файл рядом с пакетом.
Сохрани последние настройки в {{PACKAGE_PATH}}.

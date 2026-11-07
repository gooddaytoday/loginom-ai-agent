Отправь строки content-types.csv в https://httpbin.org/anything методом POST, используя для каждого тела указанный RequestContentType.
Из ответа возьми полученный сервисом тип содержимого без служебного параметра charset и текст тела; покажи вместе с исходным Case и фактическим HTTP-кодом: Case, ContentType, Body, HttpStatusCode.
Отдельно запроси https://httpbin.org/response-headers?Content-Type=text/plain&Fixture=LAB-976, разрешив ответ text/plain, затем */*. В этих двух строках используй Case=response-plain и response-any, ContentType из поля Content-Type ответа, Body из Fixture, HTTP-код фактический.
Объедини четыре результата в media-types.csv (UTF-8, запятая, заголовок) рядом с пакетом. Сохрани сценарий в {{PACKAGE_PATH}}.

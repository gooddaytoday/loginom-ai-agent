# REST-запрос (`integration.rest_request`)

Если нужны только HTTP-статусы и ошибки REST, выполняй с read.ports:[1]:
HttpStatusCode, ErrorCode и ErrorDesc находятся на порту 1. Порт 0 читай,
когда задаче нужны тело ответа или его разбор; код 200 не подтверждает тело.

GET по полному URL без query-параметров допустим: `query_parameters:[]`, `inputs:[]`,
`finish:"execute"`; входная таблица и URL-кодировщик не нужны.

# REST-запрос (`integration.rest_request`)

<!-- mode: request -->
## Режим request — методы и тело

Для POST/PUT/PATCH/DELETE выбирай `dock_node_apply` с
`target.type:"integration.rest_request"`, `mode:"request"`, `finish:"execute"`.
В `parameters.connection` укажи `name`, `base_url`, `method`;
для каждого метода создай отдельное подключение с уникальным именем.
Для POST/PUT/PATCH задай `request_content_type:"application/json"` (или
`"text/plain"`) в connection и `parameters.body_field:"Body"` — имя
наблюдённого строкового поля входа 0. Каждая строка отправляется отдельно.
Body передаётся как исходный текст UTF-8; привязка к query для него запрещена.
DELETE не принимает body_field и request_content_type. Передай исходную
таблицу в `inputs`, даже при `query_parameters:[]`, чтобы запросов было по
одному на строку. Query и Body сохраняются вместе, кодируется только query.
Исходные ответы: импорт → REST → экспорт порта 0 (RequestID, Response),
без разбора JSON и добавления метода. Статусы отдельно на порту 1.
RequestID — индекс строки с нуля. Прочитай, выгрузи и сохрани пакет.
На существующем узле `parameters:{}` сохраняет метод и тело без перенастройки.

## Пользовательские заголовки

`parameters.headers:[{"name":"X-Lab-Cycle","value":"first"}]` задаёт полный
список заголовков. Отсутствие `headers` сохраняет прежние; `[]`
очищает список. Имена уникальны без учёта регистра, CR/LF запрещены.
Секреты не поддерживаются.
`value:{"variable":"Cycle"}` привязывает строковую переменную (не NULL): `variable_inputs:[{kind:"variables",input:0,source,output}]`.
Var-вход REST и табличный `inputs[0]` для Body независимы.
Источник выполни; имя бери после mapping входа.
Cycle: `variables.user` или `variables.calculator`.
После изменения только Cycle выполни тот же REST с `parameters:{}`, `inputs:[]`,
`variable_inputs:[]`, `mappings:[]`, `finish:"execute"`: сохранённая привязка
прочитает новое значение без редактирования запроса. Не подставляй литерал.
Литерал меняй на том же REST: прежние connection/query_parameters/body_field/inputs,
новые headers и `finish:"execute"`.
Echo httpbin: `Response.headers["X-Lab-Cycle"]`, тело `Response.data`.
RequestID на обоих портах — индекс исходной строки с нуля; по нему соедини
ответ, исходный RequestId и HttpStatusCode порта 1. Выгрузи второй результат
и сохрани пакет.

## Режим request — ответы GET

Если нужны только HTTP-статусы и ошибки REST, выполняй с read.ports:[1]:
HttpStatusCode, ErrorCode и ErrorDesc находятся на порту 1. Порт 0 читай,
когда задаче нужны тело ответа или его разбор; код 200 не подтверждает тело.

GET по полному URL без query-параметров допустим: `query_parameters:[]`, `inputs:[]`,
`finish:"execute"`; входная таблица и URL-кодировщик не нужны.

Query из переменных: после `variables.to_table` преобразуй integer→string
табличным Калькулятором; исходные limit/skip оставь integer.

Ограничивай ответы через `select`, `limit/skip` по контракту API, без gzip.
HTTP 200 не доказывает получение тела. При пустом Response проверь порт 1.
Если ErrorCode ≠ 0, сообщи REST_RESPONSE_BODY_MISSING:
«тело ответа не получено: повтори запрос или уменьши ответ (select, limit/skip)».
Не выдавай пустой результат за успех и не повторяй запрос без просьбы.

Для ответа REST → таблица используй Калькулятор → Свёртка → Кросс-таблица;
деревья выбирай по просьбе о дереве или для ровных записей без вложенных контейнеров.
<!-- /mode -->

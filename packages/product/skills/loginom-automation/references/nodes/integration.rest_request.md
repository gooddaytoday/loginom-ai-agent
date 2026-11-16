# REST-запрос (`integration.rest_request`)

<!-- mode: request -->
## Имитация

Доставь файл в Loginom; используй его фактический серверный путь:
`simulation:{enabled:true,file_path:"/своя-папка/response.json"}` вместе с
connection, `query_parameters:[]`, `inputs:[]`, `finish:"execute"`.
GET без таблицы даёт один ответ. На том же узле можно менять файл;
`{enabled:false}` выключает имитацию, отсутствие simulation сохраняет её.
Readback: наблюдённые enabled/file_path.

## Методы и тело

`dock_node_apply`: `target.type:"integration.rest_request"`, `mode:"request"`,
`finish:"execute"`. В connection: name, base_url, method; для каждого метода —
отдельное подключение с уникальным именем.
POST/PUT/PATCH: connection.request_content_type — application/json или text/plain;
body_field — имя наблюдённого строкового поля входа 0. Каждая строка отправляется
отдельно, Body — исходный UTF-8 без URL-кодирования; query для Body запрещён.
DELETE не принимает body_field/request_content_type. Передавай исходную таблицу
в inputs и при `query_parameters:[]`: один запрос на строку. Query и Body
сохраняются вместе, кодируется только query.
Исходные ответы: импорт → REST → экспорт порта 0 (RequestID, Response),
без разбора JSON и добавления метода. Статусы — порт 1. RequestID — индекс
строки с нуля на обоих портах. Прочитай, выгрузи, сохрани пакет.
Существующий узел с `parameters:{}` сохраняет настройки без перенастройки.

## Заголовки

`headers:[{name:"X-Lab-Cycle",value:"first"}]` заменяет полный список;
отсутствие сохраняет, `[]` очищает. Имена уникальны без учёта регистра,
CR/LF запрещены; секреты не поддерживаются.
`value:{variable:"Cycle"}` привязывает строковую переменную не NULL через
`variable_inputs:[{kind:"variables",input:0,source,output}]`. Var-вход и
табличный inputs[0] для Body независимы. Выполни источник, имя бери после
mapping входа. Источник Cycle: variables.user или variables.calculator.
После изменения только Cycle выполни тот же REST: `parameters:{}`, `inputs:[]`,
`variable_inputs:[]`, `mappings:[]`, `finish:"execute"`. Сохранённая привязка
прочитает новое значение без правки запроса; не подставляй литерал.
Литерал меняй на том же REST: прежние connection/query_parameters/body_field/inputs,
новые headers, finish execute. Echo httpbin: `Response.headers["X-Lab-Cycle"]`,
тело `Response.data`. По RequestID соедини ответ, исходный RequestId и
HttpStatusCode порта 1; выгрузи второй результат и сохрани пакет.

## GET и ответы

Полный GET URL без query допустим: `query_parameters:[]`, `inputs:[]`,
finish execute; таблица и URL-кодировщик не нужны.
Query из переменных: после variables.to_table преобразуй integer→string
табличным Калькулятором; исходные limit/skip оставь integer.
Если нужны лишь HTTP-статусы/ошибки, читай `read.ports:[1]`:
HttpStatusCode, ErrorCode, ErrorDesc. Порт 0 — для тела/разбора.
HTTP 200 не доказывает получение тела. Ограничивай ответ через select,
limit/skip по контракту API, без gzip. При пустом Response проверь порт 1.
Если ErrorCode ≠ 0, сообщи REST_RESPONSE_BODY_MISSING:
«тело ответа не получено: повтори запрос или уменьши ответ (select, limit/skip)».
Не выдавай пустой результат за успех, не повторяй без просьбы.
REST → таблица: Калькулятор → Свёртка → Кросс-таблица; деревья — по просьбе
о дереве или для ровных записей без вложенных контейнеров.
<!-- /mode -->

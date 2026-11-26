# REST-запрос

<!-- mode: request -->
## Описания кодов

`produce_error_descriptions:false` убирает ErrorDesc из порта 1, true возвращает.
Пропуск сохраняет. Порт 1: RequestID, ErrorCode, HttpStatusCode (integer).

## Имитация

Доставь файл. Укажи серверный путь
`simulation:{enabled:true,file_path:"/своя-папка/response.json"}`.
Передай connection, query_parameters:[], inputs:[], finish:"execute".
GET без таблицы — один ответ. Путь меняй на том же узле.
enabled:false выключает. Пропуск сохраняет. Readback из UI.

## Метод и тело

`dock_node_apply`, mode request, finish execute.
connection: name/base_url/method. Разные методы — разные имена.
POST/PUT/PATCH: request_content_type application/json, text/plain или application/xml;
body_field — наблюдённое строковое поле входа 0.
Body — исходный UTF-8; query бери из других полей. Кодируется только query.
DELETE запрещает body_field/request_content_type. Передай inputs и при
query_parameters:[]; запрос на строку. Query+Body совместимы.
Сырые ответы: импорт → REST → экспорт 0 (RequestID, Response) без разбора или
колонки метода. Чтение и экспорт по просьбе. Порт 1 — статусы, RequestID
на обоих — индекс с нуля. parameters:{} сохраняет настройки узла.

## Заголовки

headers:[{name:"X-Lab-Cycle",value:"first"}] заменяет весь список;
отсутствие сохраняет, [] очищает. Имена уникальны (case-insensitive);
CR/LF/секреты запрещены.
value:{variable:"Cycle"}: строковая не NULL переменная через
variable_inputs:[{kind:"variables",input:0,source,output}].
Источник выполни, имя — после mapping; Var-вход ≠ inputs[0] Body.
Cycle из variables.user/variables.calculator. Меняй лишь Cycle, перезапусти тот же REST:
parameters:{}, inputs:[], variable_inputs:[], mappings:[], finish execute.
Привязка читает Cycle без правки запроса и подстановки литерала.
Литерал: тот же REST, прежние connection/query_parameters/body_field/inputs,
новые headers, finish execute. httpbin: Response.headers["X-Lab-Cycle"], тело Response.data.
Сведи Response, RequestID, порт 1.HttpStatusCode по правилу ниже.
Второй результат выгрузи по просьбе.

## GET и ответы

connection.response_content_type: application/json, text/html, text/plain, */* —
allowed response MIME. Response is a string; request Content-Type may carry charset=UTF-8.
GET без query: query_parameters:[], inputs:[], finish execute; no table/URL encoder.
Query: string or integer (±9007199254740991); no real/boolean. Bind integer
limit/skip from variables.to_table directly; handler URL-encodes query. Body: string only.
Keep JSON types: httpbin args.limit/skip echo as strings even with integer inputs;
no coercion unless requested. Big ints/ids: read as strings (JSON.parse rounds >2^53).
Status/errors: read.ports:[1] — HttpStatusCode/ErrorCode/ErrorDesc; port 0 — body/parsing.
200 ≠ body; bound select, limit/skip per API; no gzip.
Empty Response: port 1; ErrorCode ≠ 0 → REST_RESPONSE_BODY_MISSING:
«тело ответа не получено: повтори запрос или уменьши ответ (select, limit/skip)».
Empty result ≠ success; retry on request only.
Один `Response` с массивами записей, включая вложенные: [JSON в дерево](trees.from_json.md) → [Дерево в таблицу](trees.to_table.md).
Объект без массива: Калькулятор → Свёртка → Кросс-таблица.
Для разбора нескольких документов в строках REST используй один `programming.javascript`
(JSON.parse(Response), Append per record with its RequestID); no RequestID splits. Не объединяй ответы.
Если пользователь просил дерево, не подменяй дерево JavaScript.

## Сведение и завершение

При 1:1, исходном порядке и RequestID[i]=i на обоих портах:
transform.col_union_data, входы 0=ответ, 1=статус, 2=исходная строка.
parameters:{col_union:{row_count:"maximum",padding:"null"}}. Имена — из контекста, суффиксы не угадывай.
В разборе сверь RequestID; поля/порядок/типы — по заданию.
Нет доказанного 1:1/того же результата — Слияние по RequestID.
All required Export+Save confirmed → final answer at once.
file_artifacts подтверждает CSV; без glob/обхода папок.
<!-- /mode -->

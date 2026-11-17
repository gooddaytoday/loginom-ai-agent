# REST-запрос (`integration.rest_request`)

<!-- mode: request -->
## Описания кодов

`produce_error_descriptions:false` убирает ErrorDesc из порта 1;
остаются RequestID, ErrorCode, HttpStatusCode (integer). true — вернуть;
пропуск — сохранить. Readback — наблюдённый флаг. Выгружай сам порт 1.

## Имитация

Доставь файл; используй его серверный путь:
`simulation:{enabled:true,file_path:"/своя-папка/response.json"}`.
Передай connection, query_parameters:[], inputs:[], finish:"execute".
GET без таблицы: один ответ. Тот же узел: смена файла;
enabled:false — выключить, пропуск simulation — сохранить.
Readback enabled/file_path из UI.

## Метод и тело

dock_node_apply: target.type integration.rest_request, mode request, finish execute.
connection: name/base_url/method; разным методам — разные имена подключений.
POST/PUT/PATCH: request_content_type application/json, text/plain или application/xml;
body_field — наблюдённое строковое поле входа 0.
Body: исходный UTF-8, без URL-encode; body_field нельзя также связать с query.
DELETE запрещает body_field/request_content_type. inputs: исходник и при
query_parameters:[]; запрос на строку. Query+Body совместимы; кодируется только query.
Сырые ответы: импорт → REST → экспорт 0 (RequestID, Response), без JSON-разбора/
добавления метода. Порт 1 — статусы; RequestID на обоих — индекс строки с нуля.
Прочитай, выгрузи, сохрани пакет.
parameters:{} на существующем узле сохраняет настройки.

## Заголовки

headers:[{name:"X-Lab-Cycle",value:"first"}] заменяет весь список;
отсутствие сохраняет, [] очищает. Имена уникальны (case-insensitive);
CR/LF/секреты запрещены.
value:{variable:"Cycle"}: строковая не NULL переменная через
variable_inputs:[{kind:"variables",input:0,source,output}].
Источник выполни, имя — после mapping; Var-вход ≠ inputs[0] Body.
Cycle из variables.user/variables.calculator. Меняй лишь Cycle, перезапусти тот же REST:
parameters:{}, inputs:[], variable_inputs:[], mappings:[], finish execute.
Привязка прочтёт Cycle без правки запроса; не подставляй литерал.
Литерал: тот же REST, прежние connection/query_parameters/body_field/inputs,
новые headers, finish execute. httpbin: Response.headers["X-Lab-Cycle"], тело Response.data.
Ответ+исходный RequestId+порт1.HttpStatusCode сведи по правилу ниже;
выгрузи второй результат, сохрани пакет.

## GET и ответы

connection.response_content_type: application/json, text/html, text/plain, */* —
допустимый MIME ответа. Response — строка; Content-Type запроса может иметь charset=UTF-8.
GET без query: query_parameters:[], inputs:[], finish execute; без таблицы/URL-кодировщика.
Query: string или integer (±9007199254740991); real/boolean запрещены.
Integer limit/skip после variables.to_table — напрямую: обработчик кодирует
query. Body — только string. Статусы/ошибки: read.ports:[1] —
HttpStatusCode/ErrorCode/ErrorDesc; порт 0 — тело/разбор.
200 ≠ тело; ограничь select, limit/skip по API, без gzip.
Пустой Response: порт 1; ErrorCode ≠ 0 → REST_RESPONSE_BODY_MISSING:
«тело ответа не получено: повтори запрос или уменьши ответ (select, limit/skip)».
Пустой результат не успех; повтор — по просьбе.
Таблица: Калькулятор → Свёртка → Кросс-таблица.
Дерево: по просьбе либо ровные записи без вложенных контейнеров.

## Сведение и завершение

При 1:1, сохранённом порядке исходника и RequestID[i]=i на обоих портах
вместо Join+Attach возьми одно transform.col_union_data (Соединение):
входы 0=ответ, 1=статус, 2=исходная строка;
parameters:{col_union:{row_count:"maximum",padding:"null"}}. Имена — из контекста, суффиксы не угадывай.
В разборе сверь RequestID; поля/порядок/типы — по заданию.
Нет доказанного 1:1/того же результата — Слияние по RequestID.
Все требуемые Export+Save подтверждены → сразу итоговый ответ.
file_artifacts подтверждает CSV; без glob/обхода папок.
<!-- /mode -->

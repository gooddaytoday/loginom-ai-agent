# Управляемый HTTP fixture для Fetch/FS

Предложение LAB-1549 для полного [GitHub #69](https://github.com/gooddaytoday/loginom-ai-agent/issues/69).
Разворачивает владелец. Этот документ не запускает сервис.
Источник запросов — сервер Loginom, а не браузер или CLI. Исходный LAN
origin `http://10.200.13.132:18080` недоступен по подтверждённой пробе.
Решение от 13.11: предварительно внутри VM сервера Loginom на localhost;
доступ к VM ещё не выдан. Origin и HTTPS-порт назначает владелец.
`FIXTURE_BASE_URL` — полный data prefix, например `http://localhost:18080/runs/example-run`,
а `FIXTURE_TLS_BASE_URL` — соответствующий HTTPS data prefix.
Для каждого прогона выделяется уникальный `run_id`. Все пути данных начинаются
с `/runs/{run_id}`. Данные искусственные, авторизация пользовательских сервисов
не используется. До приёмки подтвердить доступность обоих портов из JS-узла.

## Ответы и эффекты

В таблице указан suffix после `/runs/{run_id}`. JSON передаётся UTF-8 без BOM,
бинарное тело — непосредственно указанными байтами. Не применять кеширование;
ответы имеют `Cache-Control: no-store`. HEAD имеет те же status/headers, но
пустое тело. Redirect не выходит за origin fixture.

| Метод и suffix | Статус и заголовки | Пример точного тела / эффект |
|---|---|---|
| GET `/orders` | 200, `Content-Type: application/json; charset=utf-8` | `{"orders":[{"id":"A","qty":3,"price":"12.50"},{"id":"B","qty":2,"price":"4.25"},{"id":"C","qty":0,"price":"9.99"}]}` |
| GET `/text` | 200, `Content-Type: text/plain; charset=utf-8` | `Привет, Ёж\n42` (LF, без завершающего LF) |
| GET `/binary` | 200, `Content-Type: application/octet-stream` | hex `00017f80ff` |
| GET `/missing` | 404, JSON | `{"error":"missing"}` |
| GET `/failure` | 500, JSON | `{"error":"fixture_failure"}` |
| GET `/malformed` | 200, `Content-Type: application/json` | `{"orders":` (намеренно незавершённый JSON) |
| GET `/redirect/301` | 301, `Location: /runs/{run_id}/orders` | пустое тело |
| GET `/redirect/302` | 302, тот же Location | пустое тело |
| GET `/redirect/307` | 307, тот же Location | пустое тело |
| GET `/slow?ms=3000` | 200 JSON после 3000 мс | `{"ready":true}`; задержка до headers, монотонный таймер |
| POST `/receipts` | 201, JSON | request `{"id":"A","amount":"37.50"}` → `{"accepted":true,"sequence":1}`; sequence увеличивается на каждый фактический POST |
| POST `/reports` | 201, JSON | тело — точные байты summary.csv из совместной задачи → `{"accepted":true,"sequence":1}`; тот же счётчик регистрации данного run |
| PUT `/draft` | 200 JSON | request `{"value":"draft"}` → `{"stored":true}`; заменяет только draft данного run |
| PATCH `/draft` | 200 JSON | request `{"value":"final"}` → `{"stored":true}` |
| DELETE `/draft` | 200 JSON | `{"deleted":true}`; удаляет только draft данного run |
| HEAD `/text` | 200, заголовки GET | пустое тело |
| POST `/redirect/301` или `/302` | соответствующий redirect на `/echo` того же run | пустое тело; ledger устанавливает фактический метод следующего запроса, его нельзя предполагать |
| POST `/redirect/307` | 307 на `/echo` того же run | пустое тело; ожидается сохранение метода и тела, подтвердить нативной пробой |
| GET или POST `/echo` | 200 JSON | `{"method":"POST","body_hex":"7b7d"}` для тела `{}`; заголовки только из разрешённого списка |
| GET HTTPS `/tls` | TLS handshake с самоподписанным сертификатом | HTTP-ответа нет; проверку сертификата не отключать |

Для TLS-проверки нужны журнал handshake на fixture и отдельная удачная HTTP
контрольная проба: пустой HTTP ledger сам по себе не доказывает TLS-ошибку.
Текст ошибки сохранять как evidence, oracle сравнивает её класс/исход.
TLS завершается до HTTP path: связывать handshake с run_id по URL невозможно.
Для отрицательной TLS-пробы выделить отдельный listener/порт данному run
и вернуть его в FIXTURE_TLS_BASE_URL. Админ GET
`/admin/runs/{run_id}/tls-handshakes` возвращает записи вида
`{"run_id":"example-run","listener_id":"tls-example-run","failed":true,"at":"2026-11-13T12:00:00.000Z"}`.
Не смешивать два одновременных прогона на одном TLS listener. Reset очищает
также этот журнал после завершения listener. Oracle отдельно требует одну
failed handshake и табличный tls_error; HTTP ledger остаётся без `/tls`.
Для `/slow` фиксировать получение запроса и закрытие клиентского соединения;
abort не доказывает отмену серверного эффекта. Публичный POST `/anything`
отдельно разрешён владельцем только для нативного исследования; приёмочные
POST выполняются на этом управляемом fixture.

## Ledger и административный доступ

Административные команды выполняет проверяющий, их URL/секреты не передаются
модели. Админ-сервис должен быть отделён от перечисленных data routes.
Админ GET `/admin/runs/{run_id}/ledger` возвращает все запросы этого run, включая
redirect hops и запросы, соединение которых оборвано. Пример записи:

```json
{
  "run_id": "example-run",
  "sequence": 1,
  "method": "POST",
  "path": "/runs/example-run/receipts",
  "query": "",
  "headers": {"content-type": "application/json", "x-case-id": "submit-A"},
  "body_sha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "body_bytes": 27,
  "received_at": "2026-11-13T12:00:00.000Z",
  "elapsed_ms": 4,
  "response_status": 201,
  "client_closed": false
}
```

Нулевой digest — заглушка примера; сервис вычисляет настоящий SHA-256 по
сырым полученным байтам. Ledger append-only, с атомарным sequence; commit
записи выполняется до ответа. Хранить только allowlist заголовков
`content-type`, `accept`, `x-case-id`, `user-agent`; никогда Authorization,
Cookie, Set-Cookie, proxy credentials или произвольные заголовки. Время — UTC
и отдельная монотонная длительность. Query fixture содержит только тестовые
значения. Размер/хеш тела сохраняются и при отказе/обрыве; сырые тела — только
заранее утверждённые искусственные данные, необязательны для ledger.

Админ DELETE `/admin/runs/{run_id}` возвращает `{"reset":true}` и удаляет
ledger, sequence, draft/receipt state исключительно данного run, когда его
обработчики уже завершены. Повторный GET ledger должен вернуть `[]`.
Выполнить reset перед новым прогоном, после завершения сохранить ledger как
артефакт проверки, затем reset и подтвердить пустоту. Не сбрасывать общий журнал.

Для Code/Next/Done/Preview/Execute и cold проверяющий снимает ledger до/после
каждого действия и сравнивает дельту. Один итоговый счётчик не показывает,
какой шаг повторил эффект. Для автоматически запускаемых materialization и
final Execute заранее утверждается точное число запросов; неизвестный эффект
не даёт права автоматически повторить действие. Новая бизнес-попытка использует
новый run_id. Idempotency-Key не заменяет подсчёт фактических запросов.

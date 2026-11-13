# Управляемый HTTP fixture для Fetch/FS

Предложение LAB-1549 для полного [GitHub #69](https://github.com/gooddaytoday/loginom-ai-agent/issues/69).
Реализация: `scripts/node-acceptance/fixtures/http_fixture.py`, развёртывание —
`scripts/node-acceptance/fixtures/README-http-fixture.md`. Разворачивает оркестратор.
Источник запросов — сервер Loginom, а не браузер или CLI. Исходный LAN
origin `http://10.200.13.132:18080` недоступен по подтверждённой пробе.
Fixture работает на VM сервера Loginom (`loginom-app`) в контейнере
`loginom-http-fixture` (образ `python:3.12-slim`) в сети Docker
`loginom-app-private`, общей с `loginom-app-server`:

- data: `http://loginom-http-fixture:18080`, наружу не публикуется;
  `FIXTURE_BASE_URL` — `http://loginom-http-fixture:18080/runs/{run_id}`;
- TLS: отдельный listener на прогон на внутреннем порту контейнера из
  диапазона 18443–18462, наружу не публикуется; `FIXTURE_TLS_BASE_URL` —
  `https://loginom-http-fixture:{port}/runs/{run_id}` из ответа admin
  `POST /admin/runs/{run_id}/tls-listener`;
- admin: отдельный listener 18090, опубликован на LAN-адресе VM для проверяющих
  с mas/mas2/mas3; каждый запрос требует `Authorization: Bearer <FIXTURE_ADMIN_TOKEN>`,
  без него — 401. Data-порт admin-маршрутов не обслуживает (404, вне ledger).

Для каждого прогона выделяется уникальный `run_id` (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`).
Все пути данных начинаются с `/runs/{run_id}`. Данные искусственные, авторизация
пользовательских сервисов не используется. До приёмки подтвердить доступность
обоих портов из JS-узла.

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
| GET или POST `/echo` | 200 JSON | `{"method":"POST","body_hex":"7b7d","headers":{"content-type":"application/json"}}` для тела `{}`; `headers` — только разрешённый список ledger |
| GET HTTPS `/tls` | TLS handshake с самоподписанным сертификатом | HTTP-ответа нет; проверку сертификата не отключать |

Для TLS-проверки нужны журнал handshake на fixture и отдельная удачная HTTP
контрольная проба: пустой HTTP ledger сам по себе не доказывает TLS-ошибку.
Текст ошибки сохранять как evidence, oracle сравнивает её класс/исход.
TLS завершается до HTTP path: связывать handshake с run_id по URL невозможно.
Для отрицательной TLS-пробы выделить отдельный listener/порт данному run
и вернуть его в FIXTURE_TLS_BASE_URL. Админ GET
`/admin/runs/{run_id}/tls-handshakes` возвращает записи вида
`{"run_id":"example-run","listener_id":"tls-example-run","failed":true,"at":"2026-11-13T12:00:00.000Z","error":"TLSV1_ALERT_UNKNOWN_CA"}`
(`error` — причина OpenSSL на стороне fixture, `null` при удачном handshake).
TCP-подключение без ClientHello handshake не считается и не записывается.
Listener выделяет admin `POST /admin/runs/{run_id}/tls-listener`: 201 с
`{"run_id","listener_id","port","tls_base_url"}`, повторный вызов того же run —
200 с тем же listener, исчерпание диапазона — 503 `{"error":"no_tls_port"}`.
Listener никогда не отвечает HTTP. Для положительной контрольной пробы admin
`GET /admin/tls-certificate` отдаёт PEM самоподписанного сертификата (создаётся
при старте процесса, SAN `loginom-http-fixture`, `localhost`, `127.0.0.1`).
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

Если тело оборвано (EOF, таймаут чтения) или клиент закрыл соединение во время
`/slow`, запись получает `"response_status":null`, `"client_closed":true`, размер
и SHA-256 фактически полученных байтов; эффект (`sequence` регистрации, draft)
при оборванном теле не применяется. Запись фиксируется до отправки ответа и
не меняется: если клиент закрыл соединение уже во время записи ответа (вне
ожидания `/slow`), запись остаётся с `"client_closed":false`. Всё состояние
(ledger, счётчики, draft, журнал handshake) хранится только в памяти процесса:
перезапуск контейнера его стирает и создаёт новый сертификат. Запросы вне `/runs/{run_id}` (включая
`/healthz` готовности) в ledger не попадают; неизвестный suffix — 404
`{"error":"not_found"}`, неподдерживаемый метод — 405 с `Allow`, обе записи в ledger.
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
обработчики уже завершены (ожидание до `FIXTURE_RESET_TIMEOUT`, затем 409
`{"error":"run_busy"}`), закрывает его TLS-listener и освобождает порт. Админ
GET `/admin/runs/{run_id}/state` показывает `registrations`, `draft_hex`,
`inflight`, `tls_listener`; GET `/admin/health` — готовность admin-порта. Повторный GET ledger должен вернуть `[]`.
Выполнить reset перед новым прогоном, после завершения сохранить ledger как
артефакт проверки, затем reset и подтвердить пустоту. Не сбрасывать общий журнал.

Для Code/Next/Done/Preview/Execute и cold проверяющий снимает ledger до/после
каждого действия и сравнивает дельту. Один итоговый счётчик не показывает,
какой шаг повторил эффект. Для автоматически запускаемых materialization и
final Execute заранее утверждается точное число запросов; неизвестный эффект
не даёт права автоматически повторить действие. Новая бизнес-попытка использует
новый run_id. Idempotency-Key не заменяет подсчёт фактических запросов.

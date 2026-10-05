# REST-запрос: черновик требований

Component ID: `component.integration.RestRequest`. Slug: `integration-restrequest`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `integration-restrequest:help-01` — [REST-запрос](https://help.loginom.ru/userguide/processors/integration/rest-request.html), Help 7.4, прочитано 2026-10-02.
- `integration-restrequest:help-02` — [REST-сервис](https://help.loginom.ru/userguide/integration/connections/list/rest-service.html), Help 7.4, прочитано 2026-10-02.
- `integration-restrequest:help-03` — [Примеры URL параметров](https://help.loginom.ru/userguide/integration/connections/list/rest-parameters-examples.html), Help 7.4, прочитано 2026-10-02.
- `integration-restrequest:help-04` — [Настройка аутентификации](https://help.loginom.ru/userguide/integration/connections/list/auth-type.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `integration-restrequest:r01` | GET/DELETE с параметрами, POST/PUT/PATCH с request body; query/segments/replacement URL. | Пять методов × три URL схемы: ledger проверяет метод, кодирование, порядок параметров и точные body bytes. Поле body и URL-параметр не получают один binding. | `integration-restrequest:help-01`, `integration-restrequest:help-02`, `integration-restrequest:help-03` |
| `integration-restrequest:r02` | Ручное/автоматическое сопоставление, пользовательские headers и timezone параметров. | Сверить header/URL по каждому request ID и typed полям; изменение порядка URL-параметров меняет адрес только в query/segments режимах. | `integration-restrequest:help-01`, `integration-restrequest:help-02`, `integration-restrequest:help-03` |
| `integration-restrequest:r03` | Допустимый Content-Type, оба выхода и HTTP ≥400 → completion code 6. | Wrong type и 400 дают явную ошибку в допданных; HTTP200 с неверным телом не принимается за аналитический успех. */* проверяется отдельно. | `integration-restrequest:help-01`, `integration-restrequest:help-02` |
| `integration-restrequest:r04` | Интервал запросов, retry count/delay, timeout; повторы network/408/429/5xx. | Ledger считает попытки и интервалы при transient fail→success; 400 не повторяется как transient. Учитывать эффект POST при потерянном ответе. | `integration-restrequest:help-01` |
| `integration-restrequest:r05` | Имитация ответа из файла, запись запросов на диск, управляющие переменные и label. | При simulation ledger пуст, ответ равен fixture; сохранённые request-файлы проверяются отдельно и не содержат реальные секреты. Имитация не заменяет live transport case. | `integration-restrequest:help-01` |
| `integration-restrequest:r06` | Профили аутентификации/TLS и различие connection timeout/total timeout. | Для каждого разрешённого профиля fixture отвечает только после нужной auth; неверный сертификат/credentials дают отказ. Security override не отключается автоматически. | `integration-restrequest:help-02`, `integration-restrequest:help-04` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `integration-restrequest:s1` — Методы, URL и request bindings. Требования: `integration-restrequest:r01`, `integration-restrequest:r02`. Среда: Изолированный HTTP(S) ledger fixture.
- `integration-restrequest:s2` — Ошибки, повтор, simulation и сохранение. Требования: `integration-restrequest:r03`, `integration-restrequest:r04`, `integration-restrequest:r05`. После: `integration-restrequest:s1`.
- `integration-restrequest:s3` — Полная матрица auth/TLS. Требования: `integration-restrequest:r06`. После: `integration-restrequest:s2`. Среда: Тестовые auth providers и сертификаты.

## Заметки черновика

REST connection + необязательная таблица запроса и управляющие переменные → таблица ответов и дополнительных данных. Без входного набора отправляется один запрос; с набором — запрос на строку.

REST: GET/DELETE/POST/PUT/PATCH; URL query/segments/replacement; HTTP/HTTPS; auth «Не требуется», «Имя пользователя и пароль» (Negotiate/NTLM/Basic/Digest), «Basic», «Токен OAuth» (2.0), «Клиентский сертификат из хранилища», «Файлы сертификата клиента». Certificate-store профиль — Windows. TLS enforcement задаёт администратор, а не обработчик.

Контролируемый HTTP(S) echo-сервис с request ledger и endpoints success/400/408/429/500/wrong-content-type/delay. Входные строки содержат UTF-8, reserved URL characters, дату, JSON body. Серверный ledger и заранее заданные ответы — независимый oracle.

Разрешённые native retry — часть настроек пользователя; recovery handler не добавляет ещё один HTTP retry. После lost reply проверять ledger, особенно POST/PUT/PATCH/DELETE. При отмене сохранить корреляцию завершённых и неизвестных запросов.

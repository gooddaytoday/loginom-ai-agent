# SOAP-запрос: черновик требований

Component ID: `component.integration.SoapRequest`. Slug: `integration-soaprequest`. [Карточка](README.md) · [Реестр](../../registry.json) · [Шаблон подплана](../../templates/node-plan.md).

Черновик собран 2026-10-02 по справке и исходникам `5f772aea9`; каталог: компонент есть в текущей Help 7.4. Живое исследование, E2E и прогоны не выполнялись, обработчика нет. Это входные данные для подплана, а не назначение: перед назначением подплан переписывается по шаблону — этап 0 живого исследования, самостоятельный этап 1, приёмочный комплект и задание модели.

## Источники

- `integration-soaprequest:help-01` — [SOAP-запрос](https://help.loginom.ru/userguide/processors/integration/soap-request.html), Help 7.4, прочитано 2026-10-02.
- `integration-soaprequest:help-02` — [SOAP-сервис](https://help.loginom.ru/userguide/integration/connections/list/soap-service.html), Help 7.4, прочитано 2026-10-02.
- `integration-soaprequest:help-03` — [Настройка аутентификации](https://help.loginom.ru/userguide/integration/connections/list/auth-type.html), Help 7.4, прочитано 2026-10-02.
- `integration-soaprequest:help-04` — [Сравнение редакций](https://help.loginom.ru/userguide/compare-editions.html), Help 7.4, прочитано 2026-10-02.

## Требования справки

| ID | Возможность | Предлагаемая независимая проверка | Источник |
| --- | --- | --- | --- |
| `integration-soaprequest:r01` | Операция WSDL, mapping входных параметров, выходных полей и обрабатываемых fault атрибутов. | Ledger подтверждает operation/action/envelope; сверить отдельно result=30 и заданный business fault во всех трёх портах. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r02` | По строке / группировка по ID, отсутствие входа; HTTP headers и три timezone-политики запроса. | Две строки группы A формируют один запрос с двумя Items; без входного порта — один вызов. Date и DateTime сериализуются по выбранной политике. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r03` | Ответ: default-zone, duplication родителей, strict XSD и составные метки. | Z/+03:00/naive даты и повторяющиеся элементы сверить независимым XML parser; invalid typed XML различается со strict on/off. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r04` | Описание error codes, raw SOAP response, timeout и simulation из файла; запись исходящих запросов. | Fault не считается транспортным success; timeout связан с ledger. Simulation не вызывает сервис и возвращает fixture; raw bytes совпадают с сервером. | `integration-soaprequest:help-01` |
| `integration-soaprequest:r05` | WSDL основной/резервный, XSLT, раздельная auth загрузки WSDL и запросов, TLS. | Сломанный основной WSDL включает контролируемый резервный; неверный XSLT/credentials даёт точную причину. Получение WSDL не доказывает авторизацию операции. Отдельный Basic-only пункт для SOAP не обещать: Help описывает его для REST; поддержанный Basic в username/password проверить отдельно. | `integration-soaprequest:help-02`, `integration-soaprequest:help-03` |
| `integration-soaprequest:r06` | SOAP1.1/1.2, edition/platform профили, метки/комментарии и логирование строк. | На Standard/Enterprise/Cloud проверить оба протокола по envelope и согласованным output schemas; настройки воспроизводятся новым профилем. | `integration-soaprequest:help-01`, `integration-soaprequest:help-04` |

## Предлагаемое разбиение на этапы

Разбиение — гипотеза до этапа 0. Каждый этап должен приниматься самостоятельно; общие изменения, нужные этапу, входят в его же карточку.

- `integration-soaprequest:s1` — Операции, группы и три выхода. Требования: `integration-soaprequest:r01`, `integration-soaprequest:r02`. Среда: Standard/Enterprise/Cloud, независимый WSDL/SOAP fixture.
- `integration-soaprequest:s2` — Разбор ответа, fault и debugging modes. Требования: `integration-soaprequest:r03`, `integration-soaprequest:r04`. После: `integration-soaprequest:s1`.
- `integration-soaprequest:s3` — WSDL/auth/protocol матрица. Требования: `integration-soaprequest:r05`, `integration-soaprequest:r06`. После: `integration-soaprequest:s2`. Среда: Тестовые SOAP1.1/1.2 и auth endpoints.

## Заметки черновика

SOAP connection + необязательная таблица и переменные → данные, WSDL fault, дополнительные данные. WSDL1.1 и SOAP1.1/1.2. Без таблицы — один запрос без параметров.

WSDL1.1 × SOAP1.1/SOAP1.2; WSDL из файла/URL/резерва с XSLT on/off; auth «Не требуется» / «Имя пользователя и пароль» (Negotiate/NTLM/Basic/Digest) / «Токен OAuth» (2.0) / клиентский сертификат из Windows-хранилища либо файлов. Отдельный пункт «Basic» описан Help для REST: его доступность в SOAP — discovery_required, Basic внутри username/password — отдельная проверка. Auth WSDL и операции может различаться. Каждая комбинация с отдельным источником ожидаемого envelope.

Независимый локальный WSDL и SOAP fixture: операция Sum с повторяющимися Items, ответ total, controlled WSDL fault, malformed response, delay. Input A:10,20 и B:5 даёт grouped totals30/5; ledger хранит envelope/request IDs без секретов.

Операция SOAP может изменять сервис. После неизвестного эффекта запрещён автоматический повтор; fault/error сохранять с request ID, не подменять simulation. Не публиковать секреты из raw envelope.

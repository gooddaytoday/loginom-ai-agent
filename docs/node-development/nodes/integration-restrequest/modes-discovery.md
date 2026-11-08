# REST: остальные возможности Loginom 7.4.2, LAB-976

Живое исследование 07.11.2026 на `https://app.loginom.ai/app/?testable=true`,
mas3, собственный worker назначенной пары. Исходники —
`v040@4b202757f6d0021160dd4dfc104ee788ae33cbec`; pinned Chromium 1246.
Это UI discovery и предложение приёмки. Новый CLI не собирался; новые режимы
обработчика, модельный PASS, Save/cold и кворум этим исследованием не доказаны.
Сырые DOM-снимки и очищенные ответы публикуются вложением карточки, не в Git.

Ниже короткие имена `CW` и `NW` обозначают наблюдённые корни
`MF;TF-1;WizardModelConnectionForm;ConnectionWizard` и `MF;TF-1;WizrdMCF`.
Суффиксы после `;` — именно `data-tid`, не CSS-классы или предположения по тексту.

## Выбор режима и зависимости

Метод и URL выбираются в **подключении модуля**, не в мастере REST-запроса.
Подключения доступны без администратора: модуль → Подключения → REST-сервис.
Нативное подключение переносится в граф отдельной ссылкой. Порт подключения
должен быть соединён; `NW;RESTRequestWizard;btnConnect` активирует его при необходимости.
Наблюдались состояния «Не подключено» и «Подключено».

| Возможность | Живое наблюдение / опорный `data-tid` | Степень подтверждения |
|---|---|---|
| Методы | `CW;pedVerb;ValueControl;boundlist;GET`, `POST`, `PUT`, `DELETE`, `PATCH` | Все выбраны; POST/PUT/PATCH/DELETE реально выполнены к httpbin |
| Тело | POST/PUT/PATCH открывают `NW;RESTRequestWizard;MessageBody;edtMessageBodyColumn`; в списке RequestId, Key, Body выбран Body | Реальный POST/PUT/PATCH вернул исходный текст Body |
| DELETE | В подключении исчезает `pedRequestContentType`; у запроса нет выбора тела для этого метода | Реальный echo `method=DELETE`, `data=""` |
| Headers | `NW;RESTCustomHeadersWizard;btnAddHeader`, колонки `colName` / `colHeaderValue`; новая строка header0 | `X-Lab-Cycle=lab976` реально получен сервисом |
| Тип запроса | `CW;pedRequestContentType;ValueControl`, подсказки text/plain и application/json; поле редактируемое | POST/PUT text/plain и PATCH application/json реально выполнены |
| Тип ответа | `CW;pedResponseContentType;ValueControl`, подсказки */*, text/plain, application/json; поле редактируемое | text/plain реально принят узлом, см. ниже |
| URL-размещение | `CW;pedFieldType;ValueControl;boundlist`: Строка_запроса, Добавление_сегментов, Замена | Все три выбраны и прочитаны; отдельный транспортный прогон bindings сегментов/замены не принят |
| Basic | Модальное окно `AuthModalWindow;AuthenticationForm;pedAuthMode` → Basic; отдельные pedUserName / pedPassword | Native «Тестировать» к postman-echo.com/basic-auth успешен; полный auth CSV/cold не выполнен |
| Bearer | В том же списке «Токен OAuth», поле `pedToken;ValueControl` | Native «Тестировать» к httpbin.org/bearer успешен; временный токен затем очищен, в комплект/журнал ответов не включён |
| Другие auth | Не требуется; Имя пользователя и пароль; Клиентский сертификат из хранилища; Файлы сертификата клиента | Store выбран: grdCertList пуст; файловый режим выбран: pedSSLCert, pedSSLKey, pedSSLKeyPassword пусты; реальных сертификатов нет |
| TLS | `CW;pedIgnoreCertificateErrors;ValueControl`: checkbox **не отмечен** | Успешные HTTPS-запросы с проверкой; отключение проверки и неверный сертификат не испытывались |
| Connection timeout | `CW;pedTimeOut;ValueControl`, 60000 **мс** | Прочитано в живом UI |
| Overall timeout | `NW;AdditionalParamsWizard;pedTimeout;ValueControl`, исходно пусто; введено 10 | Подпись «Общий тайм-аут (с)»; это **секунды**, не мс |
| Повторы | `pedFailedRequestRepeat;ValueControl`: Отключено (0) → 2 | После 2 поле `pedFailedRequestDelayMS` становится доступным; default 1000 мс |
| Интервал строк | `pedRequestDelayMS;ValueControl`, исходно 0 | Подпись «Задержка между запросами (мс)»; фактические интервалы не измерены |
| Имитация | `pedUseResponseStub;ValueControl;DisplayEl` включает `pedResponseStub;ValueControl` | Реально прочитан response.json: message, amount=17, ok=true; RequestID=0, ErrorCode=0, ErrorDesc=OK, HttpStatusCode=200 |
| Сохранение запроса | `pedDumpRequest;ValueControl`, зависимое `pedDumpRequestFolder;ValueControl` | Flag включён: папка разблокирована; затем выключен до выполнения. Dump не создавался |
| Описания кодов | `pedProduceErrorDescs;ValueControl`, default true → false | После false **поле ErrorDesc исчезло** из дополнительного выхода; это три поля, а не пустое значение четвёртого |
| Переменные | Отдельный физический `Input_Var-1`; выполненный строковый источник Cycle соединён штатным drag/drop | Реальный GET вернул X-Lab-Cycle=first, затем second после изменения только источника, без настройки REST |

## Выходы и реальные ответы

Порты, наблюдённые на `MF;TF-1;Graph;REST-запрос`:
`Input_Connection-0`, `Input_Var-1`, `Input_Data-2`,
`Output_Data-0`, `Output_Data-1`. При смене метода число/вид портов не меняется.
Табличный input 0 API обработчика соответствует физическому Data-2 UI;
нельзя передавать 2 в `inputs[].input` или смешивать таблицу с Var-входом.

Схема соответствует уже поддержанному GET:

| Выход | Имена и порядок | Типы |
|---|---|---|
| 0 | RequestID, Response | integer, string |
| 1 | RequestID, ErrorCode, ErrorDesc, HttpStatusCode | integer, integer, string, integer |

Эта четырёхполевая схема порта 1 соответствует **включённым описаниям**.
Отдельным последующим опытом на той же имитации выключен только
`pedProduceErrorDescs`: после выполнения порт 1 содержит RequestID=0,
ErrorCode=0, HttpStatusCode=200, без поля ErrorDesc. Число портов прежнее.
Это отдельный C10: текущий обработчик сравнивает выход с фиксированным четырёхполем,
поэтому простого переключения checkbox недостаточно для поддержки его чтения.

Реальные тела прочитаны через
`ModelForm;PreviewWindow;PreviewForm;DataSetForm;normalHeaderCt;Response_0`
и `Response_1`. У двух строк POST отдельно прочитаны RequestID=0/1,
ErrorCode=0, ErrorDesc=OK, HttpStatusCode=200 дополнительного выхода.

| Запрос | Получено в echo |
|---|---|
| POST без таблицы | Одна строка; method=POST, data="", custom header X-Lab-Cycle=lab976 |
| POST с `requests.csv` | Две строки; `{"amount":10,"note":"Привет & + /"}` и `{"amount":20,"note":"second"}` без изменения; Content-Type text/plain; charset=UTF-8; Content-Length 41/29 |
| PUT, тот же Body binding | method=PUT, первый Body без изменения, Content-Length=41, text/plain; charset=UTF-8 |
| PATCH, application/json | method=PATCH, первый Body без изменения, Content-Type application/json; charset=UTF-8; JSON amount=10 |
| DELETE, сохранённая прежняя конфигурация | method=DELETE, data="", без Content-Type и Content-Length; прежний custom header сохранён |
| GET response-headers | `{"Content-Length":"85","Content-Type":"text/plain","Fixture":"LAB-976"}`; две строки с таблицей на входе, хотя URL-параметры не связаны |
| GET /status/500, retries=2, delay=1000 мс, timeout=10 с, interval=100 мс | Порт 1: RequestID=0, ErrorCode=6, HttpStatusCode=500; ErrorDesc выключен; число попыток не наблюдалось |
| GET с полным encoded URL RequestId=r-a, Key=a%20b%26%D1%8F | args.Key=`a b&я`, args.RequestId=`r-a`; echo.url сохранил percent-encoded абсолютный URI |

Адрес последнего случая:
`https://httpbin.org/response-headers?Content-Type=text/plain&Fixture=LAB-976`.
Native «Тестировать» и выполнение узла подтвердили доступность **с облачного
сервера**, без fetch из браузера/Node. Других внешних сервисов не вводилось:
использованы домены httpbin.org и postman-echo.com из существующей приёмки.
Content-Length 41 — длина UTF-8 первого Body, не количество символов строки.
Динамические origin, даты и прочие служебные headers не входят в oracle.

Привязка header наблюдена по точному пути:
`NW;RESTCustomHeadersWizard;colHeaderValue;StringPropEdit-1;SwitchButton` →
`PropContainer;VariableContainer;VariableControl;boundlist;Cycle_(_first_)`.
Имя header также имеет собственный SwitchButton; динамическое имя не испытывалось.
Таким образом, фиксированное значение и ссылка на переменную — разные настройки,
а не подстановка литерала агентом. Для этого опыта таблица на входе не нужна:
один GET на выполнение, обычные два выхода и те же типы. Поля подключения имеют
свой VariableContainer, но принадлежат области модуля; переносить туда переменную
сценария без отдельного наблюдения нельзя. Существующий комплект
`docs/node-development/variables/acceptance/task-rest-variables.md` отдельно
описывает limit/skip и не является доказательством всех этих областей.

Для имитации использован тот же собственный загруженный файл response.json,
штатное поле серверного пути, без таблицы на входе. Возвращена ровно одна строка
fixture. Native RequestID/ErrorCode/HttpStatusCode совпали с успешным HTTP-случаем;
по одному статусу 200 отличить имитацию от сети нельзя. Различие в содержимом
Response и сохранённой настройке файла. Отсутствие сетевого запроса не заявляется.

После запроса /status/500 мастер REST заново открыт: независимо перечитаны
сохранённые retries=2, retry delay=1000, interval=100 и overall timeout=10.
Так подтверждена настройка, **не** число/время сетевых попыток. Node deadlines,
тайм-аут модели и общая оснастка не менялись.

Тип URL-параметра наблюдён через `CW;colDataType_param0` →
`grdParams;tbl;celleditor;cbx;boundlist`: Логический, Дата/Время, Вещественный,
Целый, Строковый, Переменный. Выбран Дата/Время; дополнительного timezone-поля
на странице подключения не появилось. Временный параметр удалён до сохранения.
Это наличие редактора типов, а не подтверждение wire-формата дат/Variant.
Текущее предложение C6 проверяет строковые параметры; typed/timezone остаются
явно неподтверждённым расширением, не «поддержанным автоматически».
Отдельно выполненный GET по полному уже закодированному URL подтвердил формат
echo.url для query, но не подменяет будущий тест bindings с сырым CSV. В задании C6
Url обозначает абсолютный URI из ответа с percent encoding пробелов/не-ASCII;
oracle получает этот URI из исходных строк по правилам UTF-8/RFC 3986.

## Ограничения и остановки

Первый исследовательский черновик — Package1. После возврата из подключения
к графу дважды наблюдалось native сообщение
`msgbox-1;cnt;cnt;MessagesView`: `Cannot read properties of null (reading 'getRoot')`.
Первый раз после закрытия сообщения удалось выполнить MIME-сценарий.
Затем `msgbox;cnt;cnt;cmp` сообщил «Обнаружен разрыв связи. Восстановить сессию?».
Сессия не восстанавливалась; её диагностика сохранена приватно, исследование
продолжено в новом контексте и Package2. Load при разрыве: load1=0.07,
load5=0.26 при 12 ядрах, поэтому это не отказ из-за нагрузки.
При раннем создании нового черновика наблюдался также native NodeIndex error;
после закрытия сообщения новая попытка создала Package2. Эти наблюдения не
приписываются REST-обработчику и не дают оснований править общий код в docs-PR.

Завершение: Package2 сохранён в собственную папку как
`lab976-rest-modes-20261107-1045.lgp`, затем закрыт (графов в DOM нет).
Штатный logout «Сохранить и выйти» завершился native сообщением
`msgbox;cnt;cnt;MessagesView`: `Cannot read properties of undefined (reading 'DisplayName')`.
Поэтому logout **не подтверждён**; выход без сохранения и восстановление первого
упавшего черновика не выполнялись. Диагностика сессий осталась приватной;
свой браузерный процесс завершён. Это ограничение cleanup этапа 0, не PASS
штатного CSV/Save/cold/cleanup сценария.

Недоказанное не объявляется отсутствующим в Loginom:

- Плохой TLS certificate и client-cert handshake: в разрешённом комплекте нет
  выделенного адреса/сертификатной пары; видимость полей не доказывает handshake.
  Новый внешний peer и автоматическое выключение TLS не добавлены.
- Auth с созданием/сменой настоящих credentials через инструменты модели:
  текущий REST-контракт не имеет секретных ссылок. C3 предлагает только приватно
  подготовленные подключения. Новый общий secret API — отдельное решение.
- Точное число/интервалы повторов, transient fail→success, потерянный ответ:
  публичный echo/status без ledger и итоговый CSV не доказывают попытки.
  `timeout-retry/expected.json` намеренно проверяет только конечную ошибку.
  Новый критерий/средство доказательства требует решения владельца; не обходить
  это измерением времени или объявлением readback доказательством HTTP-попыток.
- Сохранение запросов в файлы: состояние/доступность контрола наблюдены, но
  нет выделенной пустой папки и утверждённой файловой приёмки. Для C9 oracle
  предлагает ожидаемые тела и длины, не притворяясь проверкой неизвестного native
  формата. Echo-таблица не доказывает файловый результат.
- Имитация сама по себе не доказывает отсутствие сети; request dump не создавался
  с auth. Binary response, timezone typed URL-параметров, NULL/пустой вход,
  Windows store и все auth-механизмы общего username/password режима не приняты.
- Штатный upload вызывается кнопкой `FileStorageForm;btnUpload` с системным
  file chooser. Сам `input[type=file]` не имеет data-tid: это пробел разметки;
  прямой выбор DOM-input не использовался.

Предложения [задач/expected/oracle](acceptance/modes/README.md) отделены от этих
наблюдений. Уровень готовности узла/реестр и прежние GET-критерии не меняются.

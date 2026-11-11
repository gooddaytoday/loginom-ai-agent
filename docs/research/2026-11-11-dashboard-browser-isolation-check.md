# Проверка плана изоляции dashboard по первоисточникам

Проверено 2026-11-11 по первоисточникам: документация и блог [Chrome](https://developer.chrome.com/blog/connection-allowlist-announcement), исходники и документы Chromium, спецификации [WHATWG](https://html.spec.whatwg.org/) и [W3C](https://w3c.github.io/webappsec-csp/), [MDN](https://developer.mozilla.org/), исходники Vite 7.1.4 и Recharts. Сторонние обзоры не использовались.

Проверялся [план изоляции](../security/dashboard-isolation.md) (редакция от 2026-11-11 до этой проверки). Пункты 1 и 2 дополнительно сверены с текущими страницами Chrome и обсуждениями Chromium; пункты 3–9 основаны на чтении источников исследовательским агентом, ссылки приведены для повторной проверки. **Поведение в живом Chromium 152+ не проверялось**: что именно надо проверить на стенде, см. в конце.

## Итог

- Заголовок `Connection-Allowlist` существует и включён по умолчанию с Chrome 152. Запись из плана корректна.
- Идея плана верна: граница безопасности — песочница и заголовки, а не проверки при сборке.
- План неточен в семи местах: смысл `(response-origin)`, блокировка перенаправлений, порты в CSP, изоляция процессов, директива `webrtc`, проба браузера и заголовки на страницах ошибок. Все поправки перечислены в разделе «Что меняется в плане изоляции» и внесены в [план изоляции](../security/dashboard-isolation.md).
- Заголовок есть только в Chromium. Поэтому ограничение «открывать только в Chromium 152+» стало включаемым строгим режимом; по умолчанию работает обычный режим с песочницей и CSP.

## Проверка по пунктам

Вердикт: **подтверждено**, **частично**, **неверно** или **не проверено**.

### 1. `Connection-Allowlist` — подтверждено, с уточнениями

- Заголовок включён по умолчанию с Chrome 152 (выпуск в августе 2026). Перед этим шёл origin trial.
- Формат — список в круглых скобках (Inner List по RFC 9651). Токен `response-origin` пишется без кавычек, адреса — строками [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) в кавычках. Параметры идут после скобок: `report-to=<имя>`, `redirects=allow`, `webrtc=allow`. Запись из плана `(response-origin); report-to=dashboard` верна.
- Заголовок ограничивает все исходящие соединения документа: `fetch`, XHR, подресурсы, `sendBeacon`, переходы верхнего окна и фреймов, подсказки `dns-prefetch` и `preconnect`, Speculation Rules, WebSocket, WebTransport и WebRTC.
- **По умолчанию блокируются все перенаправления 3xx, даже на тот же адрес, и весь WebRTC** (`redirects=block`, `webrtc=block`). В плане этого не было.
- Браузер учитывает заголовок только на ответах-документах и на скриптах воркеров (`Sec-Fetch-Dest`: `document`, `iframe`, `worker`, `sharedworker`, `serviceworker`). Для файлов `.js` и `.css` он ничего не делает.
- Если непустой заголовок не разобрался (нет скобок, одинарные кавычки), браузер закрывает всё: пустой список разрешений.
- Chrome рекомендует именно нашу схему: недоверенный код держать в отдельном iframe, который либо на другом origin, либо в песочнице, и ставить заголовок только на этот iframe.
- В руководстве Chrome функция названа нестабильной: она есть только в одном движке и может измениться. Аналога в Firefox и Safari не найдено, заголовок там игнорируется. Общий слой для всех браузеров — CSP.
- **`(response-origin)` — это origin URL ответа вместе с портом**, а не origin документа после песочницы (там он `null`). Поэтому документ `http://dashboards.localhost:32769/…` разрешает соединения с `http://dashboards.localhost:32769`, и файлы приложения грузятся. Это следует из исходников разбора заголовка в Chromium. Доходят ли отчёты Reporting API из документа в песочнице, **не подтверждено** — проверить на стенде. Отчёт, который вызвала сама проба WebRTC, ошибкой не считать.
- **Проба `new RTCPeerConnection()`** соответствует поведению Chromium: CSP его не запрещает, а включённый заголовок заставляет конструктор бросить исключение. Ложный проход возможен, если WebRTC уже отключён политикой или настройкой браузера: конструктор бросает и без заголовка. Тогда главный канал утечки (WebRTC) и так закрыт; остаются подсказки `dns-prefetch` и `preconnect`, которые частично закрывает `X-DNS-Prefetch-Control: off`. Это нужно записать как известное ограничение пробы. Признак браузера по строке User-Agent не подходит: версия Яндекс Браузера не равна версии его Chromium.

Источники:

- [Connection allowlists, объявление Chrome](https://developer.chrome.com/blog/connection-allowlist-announcement) (23.09.2026)
- [Руководство Chrome: ограничение исходящих соединений](https://developer.chrome.com/docs/modern-web-guidance/guides/security/restrict-outbound-connections)
- [New in Chrome 152](https://developer.chrome.com/blog/new-in-chrome-152) и [заметки о выпуске 152](https://chromestatus.com/release-notes/152)
- [Дизайн в Chromium](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/main/docs/connection_allowlist_design.md), [разбор заголовка](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/network/public/cpp/connection_allowlist_parser.cc), [WICG](https://github.com/WICG/connection-allowlists)

### 2. Изоляция процессов для iframe в песочнице — частично

- С Chrome 124 (`124.0.6367.18`, desktop) включена функция `IsolateSandboxedIframes`: iframe с `sandbox` без `allow-same-origin` получает отдельный процесс, **даже если он того же сайта**, что и страница. В WebView2 это включено не позднее версии 132.
- Утверждение плана «другой порт того же адреса может попасть в один процесс с клиентом, поддомен сохраняет изоляцию origin, но не процессов» слишком широкое. Для iframe в песочнице в Chrome оно неверно.
- Отдельный регистрируемый домен всё равно нужен там, где эта функция не действует:
  - документ открыт во вкладке (CSP `sandbox` делает его origin непрозрачным, но границы функции описывают именно iframe; процесс вкладки в `chrome://process-internals` не проверялся);
  - в iframe нет `sandbox` или добавлен `allow-same-origin`;
  - браузер не Chromium: в Firefox и Safari этой функции нет.
- `Origin-Agent-Cluster: ?1` — только подсказка браузеру. Для документа с непрозрачным origin он ничего не добавляет, а поддомены одного регистрируемого домена остаются одним сайтом.
- Вывод для архитектуры: в обычном режиме достаточно отдельного порта того же адреса, потому что в Chromium процесс разделяет песочница. В строгом режиме хост приложений стоит на отдельном регистрируемом домене.

Источники:

- [PSA: Process isolation for sandboxed frames](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FkDZr8DmeIQ/m/Ks4gksKcAgAJ) (Chrome 124.0.6367.18)
- [WebView2: Isolate Sandboxed Iframes по умолчанию](https://github.com/MicrosoftEdge/WebView2Announcements/issues/99)
- [Коммит с режимами группировки](https://github.com/chromium/chromium/commit/37dd4aade257c123ff25ed4b8fa5f61aa45654ae), [Site Isolation](https://www.chromium.org/Home/chromium-security/site-isolation/), [Origin-keyed agent clusters](https://html.spec.whatwg.org/multipage/browsers.html#origin-keyed-agent-clusters)

### 3. Сайт `dashboards.localhost` и `127.0.0.1` — подтверждено

- Сайт — это схема и регистрируемый домен, **порт в него не входит**. `http://127.0.0.1:32768` и `http://127.0.0.1:32769` — один сайт. `127.0.0.1` и `dashboards.localhost` — разные сайты, так как у `127.0.0.1` нет регистрируемого домена.
- Chromium сам направляет `*.localhost` на loopback и считает его защищённым контекстом. Firefox делает то же ([bug 1220810](https://bugzilla.mozilla.org/show_bug.cgi?id=1220810)), но с точкой в конце имени закрепление не работает. Системные резолверы могут пересылать `*.localhost` наружу: спецификация это допускает.
- `http://localhost` и `http://dashboards.localhost` — тоже разные сайты. А `127.0.0.1:32768` и `127.0.0.1:32769` — один сайт: так устроен обычный режим на удалённом стенде (другой порт того же адреса). Изоляцию там даёт песочница (пункт 2), а остаточные риски перечислены в плане изоляции.
- Следствия: клиент по-прежнему открывать по `127.0.0.1`, на этом адресе опубликован порт стенда; сервер слушает `127.0.0.1` и принимает заголовок `Host: dashboards.localhost`.

Источники: [WHATWG: sites](https://html.spec.whatwg.org/multipage/browsers.html#sites), [web.dev: same-site и same-origin](https://web.dev/articles/same-site-same-origin), [Secure Contexts: localhost](https://w3c.github.io/webappsec-secure-contexts/#localhost), [MDN: Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

### 4. CSP — частично

- `'self'` в документе с непрозрачным origin не совпадает с адресом хоста. Нужны явные origin. **В них обязателен порт**: источник без порта в `http` означает порт 80, и `http://127.0.0.1` не совпадает с `:32768`. В плане порты были опущены.
- Директива `sandbox` в заголовке ответа делает песочницей и документ, открытый во вкладке. В `<meta>` и в `Content-Security-Policy-Report-Only` она игнорируется, поэтому её нужно ставить в заголовок, который принудительно применяется.
- `frame-ancestors` проверяет всех предков. У документа, открытого во вкладке, предков нет, он загрузится (в песочнице). Если сам клиент Loginom встроен в чужую страницу, `frame-ancestors <клиент>` заблокирует dashboard. Вопрос из плана остаётся открытым.
- `style-src` без `'unsafe-inline'` блокирует `<style>`, атрибут `style`, `setAttribute("style")` и `cssText`. Запись отдельных свойств через CSSOM (`element.style.display = …`) не блокируется. Так работает проп `style` у React, а текстовый измеритель Recharts пишет стили так же. Проверка на странице с реальным графиком не проводилась.
- `require-trusted-types-for 'script'` вместе с `trusted-types 'none'` бросает исключение при записи строк в `innerHTML`, `eval` и URL скриптов. Совместимость React 19 (в lockfile 19.3.1) и Recharts 3 (3.10.1) не подтверждена. Эти директивы защищают только от DOM-XSS внутри песочницы, поэтому их можно отключить, если график сломается.
- **Директива `webrtc 'block'` есть в черновике CSP 3, но в просмотренных исходниках Chromium её нет.** Браузеры игнорируют неизвестные директивы, поэтому строка безвредна, но не защищает. WebRTC закрывает только `Connection-Allowlist`.

Источники: [CSP: framework-policy](https://w3c.github.io/webappsec-csp/#framework-policy), [CSP: sandbox](https://w3c.github.io/webappsec-csp/#directive-sandbox), [CSP: webrtc](https://w3c.github.io/webappsec-csp/#directive-webrtc), MDN: [style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src) и [sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox), [HTML: iframe sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox), [Recharts: DOMUtils](https://github.com/recharts/recharts/blob/fc962394/src/util/DOMUtils.ts), [Trusted Types: интеграции](https://github.com/w3c/trusted-types/wiki/Integrations).

### 5. Подресурсы из документа с непрозрачным origin — подтверждено для Vite 7.1.4

- Vite 7.1.4 (версия шаблона) пишет в `index.html` `<script type="module" crossorigin>`, `<link rel="modulepreload" crossorigin>` и `<link rel="stylesheet" crossorigin>`. Модульные скрипты всегда запрашиваются в режиме CORS без cookie. Origin документа непрозрачный, поэтому запрос идёт с `Origin: null`.
- Достаточно `Access-Control-Allow-Origin: *` без credentials. Вариант «отражать `null` и ставить `Allow-Credentials: true`» неверен.
- Для файлов приложения не требовать `Sec-Fetch-Site: same-origin`: непрозрачный инициатор считается cross-site.
- Картинки без `crossorigin` — не CORS; их ограничивает только `img-src`.

Источники: [Vite 7.1.4: plugins/html.ts](https://github.com/vitejs/vite/blob/v7.1.4/packages/vite/src/node/plugins/html.ts), [Fetch: CORS check](https://fetch.spec.whatwg.org/#cors-check), [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS).

### 6. Cookie, адреса-«капабилити», практика отрасли — частично

- В непрозрачном origin `document.cookie` и `localStorage` бросают исключение. Но cookie в запросах определяют сайт запроса и сайт верхнего документа:
  - на отдельном регистрируемом домене cookie клиента не уходят;
  - при другом порту того же адреса cookie клиента **могут** уйти вместе с загрузкой документа приложения: cookie не различают порты. Приложение прочитать их не может, а `connect-src 'none'` и `(response-origin)` не дают их отправить. Для подресурсов из непрозрачного origin cookie не отправляются вообще;
  - подтверждение сетевым захватом не получено.
- Vite с `--base ./` даёт относительные адреса без query. Токен доступа пришлось бы вставлять в префикс пути; хеш сборки секретом не является. Исследователь рекомендовал такой токен для публичных хостов. **Мы его не вводим:** адрес содержит хеш привязки, а чтобы его получить, нужны путь пакета и оба GUID, то есть доступ к пакету. Данных в сборке нет: образец строк в исходниках ищет `dashboard_publish` перед загрузкой.
- Практика отрасли: отдельный домен, iframe в песочнице и строгий CSP — у `googleusercontent.com`, `githubusercontent.com`, webview в VS Code, плагинов Figma, Custom UI в Atlassian Forge и пользовательских компонентов Streamlit. Модель «в том же origin» (классический Jupyter, клиентские коллбэки Dash и Superset) повторять нельзя. Salesforce Locker и LWS переписывают JavaScript внутри одного origin: это не граница origin и не граница процесса. Fenced frames не подходят: они сделаны для рекламы и не дают нормального `MessageChannel`.

Источники: [HTML: cookie](https://html.spec.whatwg.org/multipage/dom.html#dom-document-cookie), [VS Code: webview](https://code.visualstudio.com/api/extension-guides/webview), [Figma: как работают плагины](https://www.figma.com/plugin-docs/how-plugins-run/), [Atlassian Forge: Custom UI](https://developer.atlassian.com/platform/forge/custom-ui/), [Streamlit: custom components](https://docs.streamlit.io/develop/concepts/custom-components/intro).

### 7. `postMessage` и `MessageChannel` — подтверждено

- Адресат `"*"` неизбежен: параметр `targetOrigin` разбирается как URL, а строка `"null"` не разбирается (`SyntaxError`).
- На каждом сообщении окна проверять `event.source === iframe.contentWindow`. `event.origin` у всех отправителей с непрозрачным origin равен `"null"`, по нему отличить нельзя.
- `MessagePort` передаётся один раз; после этого порт и есть право на обмен. Structured clone не пропускает функции, DOM-узлы и объекты `bg.*`.
- У платформы нет предела размера сообщения: враждебный фрейм может заставить родителя клонировать большое сообщение до проверки в обработчике. Это закрывают лимиты оболочки и закрытие dashboard при нарушении.
- Спецификация HTML советует дождаться сообщения «готов» от ребёнка перед отправкой порта: событие `load` может опередить навигацию. Обязательный `frame-src` на странице клиента не даёт отправить сообщение с `"*"` документу, подменённому переходом.

Источники: [HTML: posting messages](https://html.spec.whatwg.org/multipage/web-messaging.html#posting-messages), [MDN: Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), [MDN: sandbox в расширениях](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/sandbox).

### 8. Сборка недоверенного кода — подтверждено

- Подозрение владельца верно. Проверка импортов, сборка в контейнере без сети и поиск образцов данных защищают **машину сборки** и мешают случайно вшить файл. Они **не граница для зрителей**: приложение, прошедшее все проверки, остаётся кодом злоумышленника в iframe. Граница зрителей — непрозрачный origin, CSP, `Connection-Allowlist` и то, что оболочка принимает от приложения только `close` и `ready`. Поиск строк от 6 символов обходится кодированием.
- Vite при сборке встраивает файлы через `?raw`, `?url`, `import.meta.glob` и `new URL(…, import.meta.url)`. Настройка `server.fs.strict` действует только в dev-сервере, а не в `vite build`. Нужен резолвер-плагин с `enforce: "pre"` в конфигурации платформы: он отклоняет пути вне `src/` и пакетов шаблона, включая все эти формы. Относительные `url()` и `@import` в CSS тоже могут вести за пределы `src/`, их надо проверять так же.
- Запуск `tsc` и `vite` напрямую обходит скрипты из `package.json` приложения. Скрипты `postinstall` зависимостей срабатывают только при `npm install`: зависимости нужно запечь в образ или ставить `npm ci --ignore-scripts`.
- Реальные средства Docker: `--network none`, `--read-only` с tmpfs для вывода, `--cap-drop ALL`, пользователь не root, пределы памяти, CPU, числа процессов и времени. Сильнее них: rootless Podman и gVisor (`runsc`). Без контейнеров: `bwrap --unshare-net --ro-bind`, `nsjail`, `systemd-run` со свойствами песочницы. Это фильтры системных вызовов, и против уязвимости ядра они слабее виртуальной машины.
- В нашей схеме в приложении нет собственных `package.json` и конфигурации Vite, поэтому при сборке выполнять код автора нечему. Остаются чтение файлов и ошибки в парсерах `tsc` и `esbuild`.

Источники: [Vite: assets](https://vitejs.dev/guide/assets), [Docker: container run](https://docs.docker.com/reference/cli/docker/container/run/), [systemd.exec](https://www.freedesktop.org/software/systemd/man/systemd.exec.html).

### 9. Что в плане неверно, устарело или пропущено

Неверно или преувеличено:

- `(response-origin)` не превращается в `"null"` в песочнице: это origin ответа вместе с портом.
- «Поддомен не даёт изоляции процессов» слишком общо: Chrome 124+ разделяет процессы для iframe в песочнице даже в пределах сайта.
- `webrtc 'block'` в CSP не работает.
- Перенаправления блокируются по умолчанию, в том числе на тот же адрес.
- Источники CSP без портов `:32768` и `:32769` не совпадают с адресами стенда.

Пропущено:

- CSP, `Connection-Allowlist` и `Permissions-Policy` нужно отправлять на каждом ответе-документе хоста приложений, включая страницы ошибок, а не только в `index.html`. Иначе из `index.html` можно перейти на ответ без заголовков в рамках того же разрешённого хоста.
- Кроме заголовка `Permissions-Policy` нужен атрибут `allow` на iframe с пустыми списками. Заголовок покрывает открытие во вкладке, атрибут — ответ без заголовка. Значение `'self'` в нём не совпадёт с непрозрачным origin.
- `Cross-Origin-Opener-Policy` откладывать до проверки входа через OpenID: `same-origin` обнуляет `window.opener`, а `same-origin-allow-popups` сохраняет его только для окон без собственной изолирующей политики.
- `credentialless` iframe, fenced frames и `Document-Isolation-Policy` песочницу не заменяют.
- Отклонять `Sec-Fetch-Site: cross-site` на API Loginom правильно, но для файлов приложения это неверная проверка. От DNS rebinding защищает проверка заголовка `Host`. Private Network Access — только вежливость браузера. Привязка к loopback не останавливает страницу с DNS rebinding в браузере пользователя: запрос идёт на `127.0.0.1` с чужим `Host`.

## Что меняется в плане изоляции

Порядок — по важности. Всё это внесено в [план изоляции](../security/dashboard-isolation.md).

1. Записать, что `(response-origin)` — origin ответа вместе с портом, и что отчёты из документа в песочнице проверяются на стенде.
2. Записать `redirects=block` по умолчанию: никаких перенаправлений на файлах приложения, в том числе добавления косой черты к `/apps/<ключ>/<хеш>`. Адрес iframe всегда точный. Заголовки отправлять на каждом ответе хоста приложений.
3. Писать источники CSP со схемой, хостом и портом; `'self'` не использовать; директиву `webrtc` убрать.
4. Сузить утверждение об изоляции процессов; `Origin-Agent-Cluster` — подсказка. Проверить процессы в `chrome://process-internals` для iframe и вкладки.
5. Записать ложный проход пробы при отключённом WebRTC.
6. Токен в адресе не вводить: достаточно GUID в ключе привязки и отсутствия данных в сборке.
7. `Access-Control-Allow-Origin: *` без credentials на файлах приложения; `Sec-Fetch-Site` для них не проверять.
8. Включить `frame-src` на странице клиента до первой отправки данных; порт передавать после сообщения `ready` и проверки `event.source`.
9. Trusted Types включать только после проверки на реальном графике.
10. Добавить `allow` на iframe, оставить COOP до проверки OpenID, проверять `Host` в Apache и в Node.

## Что не проверено

Это нужно проверить на стенде при приёмке изоляции (этап M2 [roadmap](../superpowers/specs/2026-11-11-dashboard-architecture-roadmap.md)):

- Доходят ли отчёты `Connection-Allowlist` и CSP из документа в песочнице до `/_reports`.
- Как `(response-origin)` ведёт себя с портом при реальной загрузке файлов приложения.
- Какой процесс получает вкладка с адресом приложения (`chrome://process-internals`).
- Работают ли React 19 и Recharts 3 под строгим `style-src` и Trusted Types на странице с графиком.
- Позиции Firefox и Safari по `Connection-Allowlist` (страницы standards-positions не открывались).
- Слой CSP отдельно от `Connection-Allowlist`: переход `location = "https://…"` на чужой адрес при принудительном `frame-src` на странице Studio. В Chromium 154 с заголовком этот переход блокирует сам `Connection-Allowlist`, поэтому обычный прогон набора вредоносных dashboard слой CSP не проверяет. Нужен прогон без заголовка (автотест на Chromium 154) и ручная проверка в Firefox.

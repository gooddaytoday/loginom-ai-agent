# Ошибка сохранения файла при доставке CSV в Loginom

Диагностика сбоя, из-за которого загрузка файла в evals и CLI не доходит до сверки байтов. Ниже отдельно зафиксированы повторная проверка и расследование 2026-09-22…2026-09-24.

**Исправлено в исходниках 2026-09-24.** Браузер Dock скрывает `showSaveFilePicker` до загрузки Loginom; клиент выбирает обычное скачивание. Полная доставка, экспорт CSV/TSV и сохранение пакета проверены на Loginom 7.4.2 в headless и headed. Ранее предложенное снятие перехвата file chooser само по себе было недостаточным.

## Реализация и приёмка исправления

- [browser-downloads.mjs](../../../packages/loginom-runtime/client/lib/browser-downloads.mjs) формирует общий init script. Он убирает только `showSaveFilePicker` на origin настроенного Loginom. Сторонние origin сохраняют API; в старом standalone Dock без настроенного URL политика действует во всём выделенном браузерном контексте.
- [session.mjs](../../../packages/loginom-runtime/client/lib/session.mjs) записывает script в приватный каталог сессии с правами `0600` и подключает через штатный MCP `browser.initScript`. Это покрывает браузер, которым владеет MCP, новые вкладки и reload.
- [connection-check.mjs](../../../packages/loginom-runtime/src/connection-check.mjs) устанавливает тот же script через `context.addInitScript` **до** первого `loginPage`/`goto`. Desktop и CLI авторизуют страницу до подключения MCP; один только конфиг MCP не исправил бы уже выбранный Loginom способ сохранения.

Слушатель `filechooser`, загрузка через `setInputFiles`, origin/name/bytes/SHA-256/cleanup проверки, версии зависимостей и код Loginom не изменены. Сессия использует тот же авторизованный контекст. Новый `.mjs` автоматически входит в runtime source pin и в staged resources.

Регрессионные проверки `browser-downloads.integration.test.mjs` сначала упали на обоих путях запуска: первый скрипт страницы видел `function` вместо `undefined`. После исправления они проходят в headless и headed с настоящим Chromium/MCP. Проверены реальное событие `download` и содержимое файла, скрытый input через `setInputFiles`, `browser_file_upload` через настоящий chooser, reload, новая вкладка и сохранение API на другом origin. Модульные проверки дополнительно покрывают идемпотентность, отсутствие API, другие порты/протоколы и сохранение `showOpenFilePicker`.

Результаты проверок на Node `24.19.0`:

- Новые unit/browser проверки в headless: **5/5**.
- Browser-проверки в headed вместе с artifact download/upload/verification/delivery, connection и source-pin тестами: **88/88**.
- Полный `client/test/*.test.mjs`: **2329 passed, 4 skipped, 0 failed**. Два skip — Windows-only, ещё два — browser-тесты без opt-in; последние отдельно пройдены в обоих режимах.
- `bun typecheck` в `packages/loginom-host`: успешно.

Browser-тесты запускаются из `packages/loginom-runtime/client` с `LOGINOM_DOCK_TEST_BROWSER` — абсолютным путём к pinned Chromium. Для headed дополнительно `LOGINOM_DOCK_TEST_HEADED=1`:

```bash
LOGINOM_DOCK_TEST_BROWSER=/home/kiselev/git/loginom-ai-agent/evals/.bundle/browsers/chromium-1243/chrome-linux64/chrome \
  /home/kiselev/git/loginom-ai-agent/evals/.bundle/bin/node --test test/browser-downloads.test.mjs test/browser-downloads.integration.test.mjs
```

Полная живая приёмка выполнена новым [artifact-download-acceptance.ts](../../../packages/loginom-host/script/artifact-download-acceptance.ts). Это managed runtime через настоящий Host IPC и публичные compact Dock tools, без LLM и без прямых browser-вызовов в приёмочном сценарии. Ресурсы собраны из текущих исходников штатным `stageResources` в отдельный `/tmp/loginom-save-picker-fix.2BKuWQ/resources`; хеши трёх изменённых runtime-модулей в manifest сверены с рабочим деревом. Старый eval-bundle не переписывался.

| Проверка на `http://localhost/app/`, Loginom 7.4.2 | Headless | Headed |
| --- | --- | --- |
| Доставка исходного CSV, 23 байта | `SUCCEEDED`, SHA-256 совпал, cleanup подтверждён | То же |
| Доставка TSV, 23 байта | `SUCCEEDED`, SHA-256 совпал, cleanup подтверждён | То же |
| Импорт CSV | `SUCCEEDED`, 3 строки | То же |
| Экспорт CSV и TSV через `exports.text` | Оба файла: 23 байта, SHA-256 совпал с исходными данными | То же |
| `package.save_checkpoint` | `.lgp` сохранён, `modified: false` | То же |
| Завершение owned-сессии | Пакет закрыт, выполнен logout, изменения не отбрасывались | То же |

В обоих `execution-events.jsonl` подтверждены по два `download_completed`/`download_verified`/`artifact_delivery_completed` и два `export_file_download_completed`. Нет `DOWNLOAD_EVENT_MISSING` и `Intercepted by Page.setInterceptFileChooserDialog`. Внутренние квитанции содержат `bytes_verified: true`; compact delivery сообщает `upload_completion_verified: true`, совпадающий hash и `cleanup_complete: true`.

CSV SHA-256: `3e54a7b66ce89ba9f5f6228df2123f10ce9fd8cad80413ea3321294b8287d26b`.
TSV SHA-256: `da13b202f35af8241793f9d6eef654f1abd7b5f6bc80900f6b35d748a95aa205`.

Команда живой приёмки из `packages/loginom-host` (аккаунт теста без пароля, ключ читается приватно и передаётся по IPC):

```bash
LOGINOM_AI_AGENT_TEST_CONFIG=/home/kiselev/.loginom-dock/config.json \
LOGINOM_AI_AGENT_TEST_RESOURCES=/tmp/loginom-save-picker-fix.2BKuWQ/resources \
LOGINOM_AI_AGENT_TEST_URL=http://localhost/app/ \
LOGINOM_AI_AGENT_TEST_USER=user \
  bun script/artifact-download-acceptance.ts
```

Итог — `passed: true`. Приватные квитанции: `/tmp/loginom-artifact-acceptance-Plghp8/results.json` и каталоги `attempts` рядом; журналы тестов: `/tmp/loginom-save-picker-fix.2BKuWQ/`. В git сырые журналы и credentials не включены. Уникальные тестовые CSV/TSV/пакеты оставлены в `/user`; пакеты закрыты.

Границы результата: проверены текущие исходники и отдельный Linux runtime bundle. Установленные Desktop/CLI не пересобирались и не обновлялись; Windows/macOS, review-стенд и полный LLM eval-прогон не запускались. Для использования исправления приложением нужен новый bundle/сборка с этими исходниками.

## Результат повторной проверки 2026-09-24

Проверен checkout `loginom`, HEAD `c4bacff05`, Node `24.19.0`, Playwright MCP `0.0.80`, Playwright `1.63.0-alpha-2026-08-31`, Chromium `153.0.8010.12` (revision `1243`). Локальные контейнеры `loginom-client-7.4.2-test` и `loginom-server-7.4.2-test` работают; `http://localhost/app/?testable=true` сообщает Loginom `7.4.2` и `isSecureContext === true`. Chromium запускался с sandbox.

На реальной странице открыты «Файлы» → `/user`; выполнен двойной щелчок по уже существующему `1caef38062bff851a80ea950adf52ad3575fd86e1435c65caf409faa3d554fb2-0-sales.csv`. Каждая проба использовала отдельный браузерный контекст; новые файлы на сервер не загружались. Слушатель `download` регистрировался до жеста, ожидание — 15 секунд, как в runtime.

Все четыре варианта проверены в headless и headed, всего восемь проб:

| Условия | Диалог ошибки Loginom | Событие `download` | Сверка байтов |
| --- | --- | --- | --- |
| `page.on('filechooser', handler)` | `Intercepted by Page.setInterceptFileChooserDialog()` | Нет | Не достигнута |
| Слушатель добавлен, затем снят через `page.off` | Нет | Нет за 15 секунд | Не достигнута |
| Слушатель вообще не добавлялся | Нет | Нет за 15 секунд | Не достигнута |
| `showSaveFilePicker` отсутствует до загрузки скриптов Loginom, слушатель `filechooser` остаётся | Нет | Одно | Успешна, 23 байта |

Последний вариант — только диагностический эксперимент: `context.addInitScript(() => { delete window.showSaveFilePicker; })` в изолированном контексте включает существующий резервный путь Loginom. Исходники приложения, сервер, `node_modules` и код продукта не менялись. Это проверка направления решения, а не принятый production-патч.

Оба полученных файла побайтно совпали с `sales.csv` из `evals:evals/tasks/group-sum-qty/data/sales.csv` (ref `7802b7676adb22dd81f284bd723e3ff1081d6401`). В текущем checkout `loginom` этого исходника нет; он извлечён через `git show`, без переключения ветки. SHA-256 всех трёх копий:

```text
3e54a7b66ce89ba9f5f6228df2123f10ce9fd8cad80413ea3321294b8287d26b
```

Отдельно проверен настоящий MCP, запущенный через текущий `createSession(..., { headless: true, managed: ... })`, с его сгенерированным `playwright.json`. Вызов `browser_run_code_unsafe` на странице MCP подтвердил один постоянный слушатель `filechooser`, тот же диалог ошибки и отсутствие `download`. Таким образом, источник перехвата подтверждён не только чтением бандла и ручным добавлением слушателя.

В скриптах реально установленного Loginom найдена вторая часть причины:

- `bg/lib/BrowserUtils.js:5` выбирает `bg.ShowSaveFilePicker` один раз при загрузке, по наличию глобального `showSaveFilePicker`.
- `bg/filestorage/FileDownloader.js:127` при наличии этого API получает файловый handle, вызывает `createWritable()`, пишет серверные байты и закрывает поток. Это путь прямого сохранения в файл.
- Только ветка без этого API вызывает `CreateObjectUrlAndDownload()`, которая формирует `File` и запускает обычное скачивание через `bg.ext.SaveAs`.

Поэтому снятие перехвата не переключает Loginom на обычное скачивание. Удалять API после инициализации `BrowserUtils.js` тоже поздно: выбор ветки уже сохранён в `bg.ShowSaveFilePicker`. Различие между прямой записью через файловый handle и обычным скачиванием также описано в [документации Chrome](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

Проверки `artifact-download.test.mjs` и `artifact-verification.test.mjs` прошли: **20/20** на Node `24.19.0`, запуск из `packages/loginom-runtime/client`. Эти тесты используют подставное событие `download` и не проверяют совместимость настоящего MCP с File System Access API; их успех не опровергает браузерное воспроизведение.

Временные доказательства: `/tmp/artifact-save-picker-recheck-20260924/` — `matrix.mjs`, `matrix.json`, `mcp.mjs`, `mcp.json`, `mcp-error.png`, исходный и два скачанных CSV. В git остаются только выводы в этом документе, без сырых журналов.

Ограничения: повторно проверен этап обратного скачивания существующего файла, а не полный `loginom_dock_artifact_deliver` или eval-прогон. Системный диалог в пробах без перехвата не подтверждался сохранением файла. Review-стенд, установленный Desktop и другие ОС в этой повторной проверке не проверялись. Исправление в продукт не внесено.

## Что ломалось до исправления

Агент вызывает `loginom_dock_artifact_deliver`. CSV появляется в файловом хранилище `/user`, но операция сразу возвращает:

- статус `AMBIGUOUS`
- код `ARTIFACT_DELIVERY_INCOMPLETE`
- текст `Destination bytes require inspection`

Пакета `.lgp` после этого нет: проверка загрузки не завершена, следующий шаг сценария упирается в незакрытую операцию.

В окне Loginom при этом есть диалог. Заголовок: `Loginom 7.4.2`.

```text
Ошибка при сохранении файла "<хеш>-0-sales.csv"

1. Failed to execute 'showSaveFilePicker' on 'Window': Intercepted by Page.setInterceptFileChooserDialog().
```

Технические подробности того же диалога: дата срабатывания, редакция Enterprise, версия Loginom 7.4.2, ОС Linux, класс исключения `Exception`, сообщение «Ошибка при сохранении файла …». Кадр: `/tmp/loginom-error-shots/crop-dialog.png`. Текст: `/tmp/loginom-download-error.txt`.

Журнал runtime эту фразу не сохраняет. Наблюдатель помечает диалог как `[outside selected root]`, потому что окно лежит вне выбранного корня вкладки. В `execution-events.jsonl` остаётся только внутренний код `DOWNLOAD_EVENT_MISSING`.

## Куда править

Не редактировать `node_modules`. Постоянный слушатель живёт в зависимости Playwright MCP, которую Dock поднимает как браузер сессии.

1. Источник поведения: класс `Tab` в Playwright MCP, собранный в `packages/loginom-runtime/client/node_modules/playwright-core/lib/coreBundle.js` (исходный путь внутри бандла: `packages/playwright-core/src/tools/backend`, конструктор `Tab`). При создании вкладки на страницу всегда вешается `page.on("filechooser", …)`. Подписка включает CDP `Page.setInterceptFileChooserDialog`. Слушатель нужен инструменту `browser_file_upload` (`uploadFile` в том же бандле): он ждёт модальное состояние `fileChooser`.
2. Место, где Dock включает этот браузер: `packages/loginom-runtime/client/lib/session.mjs`, функция `createSession`. Конфиг MCP пишет `capabilities: ['core', 'vision']` и запускает `@playwright/mcp`. Пока вкладка MCP жива, перехват диалога выбора файла включён на всё время сессии.
3. Место, где это бьёт по доставке: `packages/loginom-runtime/client/lib/artifact-discovery.mjs` (`discoverArtifactAndDownload`) и `packages/loginom-runtime/client/lib/executor.mjs` (`browserArtifactDownload`). После загрузки runtime дважды щёлкает строку CSV и 15 секунд ждёт `page.waitForEvent('download')`. На защищённом origin Loginom 7.4.2 сохраняет файл через `showSaveFilePicker`, а не через обычное скачивание. Перехваченный chooser превращает этот вызов в исключение, события `download` нет.

Собственный код репозитория строку `filechooser` не вызывает. Искать её в `packages/loginom-runtime/client/lib` бесполезно: подписка приходит из MCP.

### Выбор решения после диагностики

Runtime поддерживает обычное скачивание; одного управления перехватом chooser для него недостаточно. При диагностике рассматривались два направления:

- На уровне сессии Dock обеспечить обычное скачивание, чтобы Loginom выбирал свой резервный путь с самого начала загрузки страницы. Это направление реализовано общим ранним init script и прошло приёмку выше.
- Либо добавить полноценную поддержку File System Access API: управление системным сохранением, получение реально записанных байтов, привязку к странице и операции, проверку имени/размера/хеша и очистку. При таком решении понадобится также управление перехватом chooser. Простое снятие слушателя эту поддержку не заменяет.

Для обоих вариантов:

- Сохранить проверки origin, имени файла, размера, SHA-256 и завершения очистки. Размер строки в хранилище не заменяет сверку байтов.
- Не заменять это правкой Loginom, каталога действий Dock, `packages/loginom-runtime/client/lib/workspace.mjs` и рубрики evals.
- Не патчить установленный `coreBundle.js` в `node_modules` как постоянное решение: правка сотрётся при обновлении pin. Обновление MCP само по себе нельзя считать решением без проверки реального сохранения и хеша.

Загрузка через скрытый `input[type=file]` (`setInputFiles` в `browserArtifactUpload`, `executor.mjs`) здесь ни при чём: файл на сервер уходит. Ломается следующий шаг, обратное сохранение/скачивание для сверки байтов.

### Как проверяли причину и критерии исправления

На `http://localhost/app/?testable=true` (защищённый контекст, `window.isSecureContext === true`); пункты 1–3 относятся к контрольному Chromium без нового init script:

1. Без слушателя `filechooser` вызов `showSaveFilePicker` не должен сразу отвергаться. Ожидание: системный диалог сохранения, а не исключение.
2. Со слушателем `page.on("filechooser")` тот же вызов должен давать ровно `AbortError: Failed to execute 'showSaveFilePicker' on 'Window': Intercepted by Page.setInterceptFileChooserDialog().`
3. После снятия слушателя проверить не только исчезновение исключения, но и получение байтов: текущий код на этой проверке всё ещё не получает `download`.
4. Для обычного скачивания проверить резервную ветку Loginom с отсутствующим API до загрузки приложения, сохранив слушатель `filechooser`. Должны появиться `download`, точное имя файла и совпадающий SHA-256.
5. После production-исправления повторная доставка `sales.csv` из `evals/tasks/group-sum-qty/data/sales.csv` должна завершаться `SUCCEEDED`, `bytes_verified: true` и подтверждённой очисткой в headless и headed. Отсутствие `DOWNLOAD_EVENT_MISSING` и диалога ошибки само по себе недостаточно. Проверить также исходную загрузку через `setInputFiles` и сохранение/скачивание других поддерживаемых артефактов.

Headless для этой проверки не нужен. Ошибка воспроизводится в обычном окне.

## Что это не является

- Подтверждён конфликт с перехватом chooser и несовпадение способов сохранения. Без перехвата `showSaveFilePicker` на localhost не отвергается с этой ошибкой. Сравнение версий Loginom до/после изменения не проводилось, поэтому вывод о наличии или отсутствии регрессии самого Loginom не установлен.
- В предыдущей проверке локальный клиент job 1324502 и review-стенд сообщали `7.4.2`. Совпадение строки версии само по себе не доказывает идентичность сборок. Повторная проверка изолирует конфликт на локальном клиенте изменением только браузерных условий.
- Не следствие `--headless`. Evals всегда передают этот флаг, но headed-прогон CLI падает так же.
- Не несовпадение байтов. Строка файла в хранилище уже есть, размер совпадает с исходником. До сравнения хеша код не доходит.
- Не `UI_BUILD_MISMATCH` и не `LOGINOM_RECOVERY_REQUIRED` как первопричина. `dock_prepare` принимает стенд. Блокировка следующих вызовов была следствием незакрытой доставки; фикс `131ae037d` снял глухую блокировку, но не сделал сверку успешной.

## Расследование

### Прогоны evals

Базовый прогон до фикса recovery: `20260922-112519-5c294179a`, стенд `loginom-server-7.4.2-test`, модель `xiaomi-token-plan-sgp/mimo-v2.6-pro`, 9 попыток, score 0. Во всех попытках `loginom_dock_prepare` завершался `READY`, профиль `loginom-7.4.2-linux-chromium-ru`, `loginom_build` `7.4.2`. Затем `loginom_dock_artifact_deliver` возвращал `AMBIGUOUS` / `ARTIFACT_DELIVERY_INCOMPLETE`. Следующий вызов Loginom получал `LOGINOM_RECOVERY_REQUIRED`, инструменты Loginom пропадали из списка.

Повтор после rebase `evals` на `loginom` с фиксом `131ae037d` (`feat(loginom): stop blocking the next scenario after an uncertain operation`): run `20260923-092252-7802b7676`. Блокировка `LOGINOM_RECOVERY_REQUIRED` ушла, агент продолжал работу, но доставка по-прежнему `AMBIGUOUS`. Итог остановлен на девятой попытке: completion 0, пакетов `.lgp` нет. В журналах runtime у 24 из 25 попыток код `DOWNLOAD_EVENT_MISSING`. Рядом есть `UPLOAD_SERVER_VERIFICATION_REQUIRED`: скрытый input принял файл, завершение передачи на сервер ещё не доказано байтами.

Пример следа из журнала, `sales.csv` размером 23 байта (`evals/tasks/group-sum-qty/data/sales.csv`):

- `artifact_file_size_verified` с `bytes: 23`
- `artifact_file_discovered` для `/user/<хеш>-0-sales.csv`
- `download_gesture_result` со `status: SUCCEEDED`, `error_code: null`
- затем `DOWNLOAD_EVENT_MISSING`, фаза `requesting`

Размеры исходников задач: `sales.csv` 23 байта, `orders.csv` 42, `amounts.csv` 13. Совпадение размера в таблице «Файлы» значит, что строка в хранилище уже есть.

Harness сворачивает неуспешную проверку в одну фразу. В `packages/loginom-runtime/client/lib/artifact-delivery.mjs` после `verifyDeliveredArtifact` условие требует `SUCCEEDED`, `cleanup_complete` и `bytes_verified`. Иначе наружу уходит `Destination bytes require inspection`. Внутренний `DOWNLOAD_EVENT_MISSING` в ответ агенту не попадает.

### Headless и CLI

Evals запускают агента так: `evals/src/cli.ts`, аргументы `run --headless --format json …`. Сам CLI по умолчанию окно показывает. Флаг разбирается в `packages/agent/src/cli/standalone-run.ts`: `headless` истинен только если в команде есть `--headless`.

Отдельный браузер проверки готовности всегда headless. Это `packages/loginom-host/src/host.ts`: `headless: validation || chat === "readiness" || options.headless === true`. К доставке файла в чате сценария он не относится. У него `--ozone-platform=headless`. У браузера сценария в headed-прогоне были `--start-maximized` и `--ozone-platform=x11`, флага `--headless` не было.

Headed-прогон 2026-09-24, модель `xiaomi-token-plan-sgp/mimo-v2.6-pro`, файл `sales.csv`, без `--headless`: тот же `ARTIFACT_DELIVERY_INCOMPLETE` и в журнале попытки снова `DOWNLOAD_EVENT_MISSING`. Профиль CLI: `evals/.profile/agent`, bundle: `evals/.bundle`. Стенд на этот момент: контейнеры `loginom-client-7.4.2-test` (порт 80) и `loginom-server-7.4.2-test`. Клиент `loginom-client-master` был остановлен, потому что держал порт 80.

Повторный headed-прогон в тот же день снят с экрана. Диалог виден на кадре `/tmp/loginom-error-shots/at-error.png` и в вырезке `crop-dialog.png`. Текст приведён в начале файла.

### Сравнение localhost и review-стенда

Оба адреса отдают `bg.app.Version === "7.4.2"`.

| Адрес | `isSecureContext` | `showSaveFilePicker` |
| --- | --- | --- |
| `http://localhost/app/?testable=true` | `true` | функция есть |
| `http://dev-test-linux.bg.local/review/7.4.2-test/app/?testable=true` | `false` | `typeof === "undefined"`, вызов даёт `TypeError: window.showSaveFilePicker is not a function` |

Проба тем же Chromium из `evals/.bundle/browsers/chromium-1243` и `playwright-core` клиента:

- localhost, контекст без слушателя `filechooser`: `showSaveFilePicker` не отвергается сразу, вызов остаётся `pending` (открывается системный диалог сохранения).
- localhost, `page.on("filechooser", …)`: сразу `AbortError` с текстом `Intercepted by Page.setInterceptFileChooserDialog()`. Это та же строка, что в диалоге Loginom.
- review-стенд в обоих режимах: API отсутствует, поэтому этот диалог там не возникает.

Панель «Файлы» в короткой пробе не открылась: кнопка есть в DOM, но вне видимой области, двойной щелчок по строке CSV на review-стенде не выполнен. Для вывода хватает измерения API: на небезопасном HTTP Loginom не может пойти в `showSaveFilePicker`.

Локальный клиент собран из job 1324502 ветки `7.4.2-test`. Review URL указан как тот же коммит. Строка версии на обоих стендах одинаковая. Отличается origin: localhost для браузера является защищённым контекстом, имя `dev-test-linux.bg.local` по HTTP нет. Поэтому один и тот же клиентский код на localhost выбирает File System Access API, а на review-стенде этой функции нет.

### Цепочка в коде

1. `executor.mjs`, `browserArtifactUpload`: находит скрытый `input[type=file]` тулбара `FileStorageForm;tbrActions` и вызывает `setInputFiles`. Это не открывает диалог выбора файла. Успешная подача input возвращает `UPLOAD_SERVER_VERIFICATION_REQUIRED` с `upload_submitted: true`.
2. `artifact-discovery.mjs`: в уже открытом каталоге ищет строку `FileStorageForm;colName_<имя>`, сверяет `storage_entry.bytes` с размером вложения, затем вызывает загрузчик с жестом `double_click`.
3. `executor.mjs`, `browserArtifactDownload`: регистрирует `page.waitForEvent('download', { timeout: 15000 })`, выполняет двойной щелчок. Если жест принят, а события нет, код `DOWNLOAD_EVENT_MISSING`, статус `AMBIGUOUS`.
4. `artifact-delivery.mjs` превращает любую такую неуспешную проверку в `Destination bytes require inspection`.
5. Playwright MCP в конструкторе `Tab` слушает `filechooser` с момента создания страницы. Подписка выставляет `Page.setInterceptFileChooserDialog`. На защищённом origin двойной щелчок Loginom доходит до `showSaveFilePicker`, Chromium отвергает вызов, Loginom показывает «Ошибка при сохранении файла».

`packages/loginom-host/src/host.ts` и флаг `--headless` в evals на этот механизм не влияют: перехват включается и в видимом окне.

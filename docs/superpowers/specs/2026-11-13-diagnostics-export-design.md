# «Собрать диагностику» — проект (#297, часть 1: архив без сервера)

Дата: 2026-11-13. Задача: [#297](https://github.com/gooddaytoday/loginom-ai-agent/issues/297), этап 1 «Локально». Проверенная база: `v040@cb0733a0b77d62b2323be3ec35d03d98efc98858`. Серверная часть #297 (детектор `crash_candidate`, согласие, очередь, приём, классификация) — вне этого проекта.

Документ — дельта к уже влитому экспорту журналов Desktop ([#549](https://github.com/gooddaytoday/loginom-ai-agent/pull/549), LAB-525). Для каждого раздела: что есть (файл:строка) → чего не хватает → что меняем. Пути ниже — относительно `packages/`.

## Что уже есть (#549)

- `desktop/src/main/logging.ts:97` `exportDebugLogs()` пишет `Downloads/loginom-ai-agent-debug-<stamp>.zip` и открывает папку (`:118`).
- Состав архива:
  - 5 последних по mtime `execution-events.jsonl` и 5 последних `diagnostics/*/events.jsonl` (`:108–113`);
  - журналы Desktop за 24 ч (`:114`) и серверные журналы (`:115`);
  - Crashpad (`:116`): собирается, но исключается как двоичный (`:274`).
- Обезличивание (`:285–391`):
  - общий `createRedactor()` из `loginom-runtime/client/lib/redact.mjs`;
  - домашний каталог → `~` (`:244`);
  - независимая проверка остатка секретов `hasExportSecret` (`:229`): файл с остатком исключается с причиной в manifest.
- Лимиты: 2 MiB хвоста на файл, JSONL с целого события (`:255`); 20 MiB на архив (`:26–32`).
- `manifest.json`: version, channel, `sourceSHA`, `sourceDirty`, платформа; по каждому файлу — размер, SHA256, причина пропуска (`:170`, `:374`).
- Вход:
  - пункт «Экспортировать журналы…» в меню «Справка» и в меню приложения на macOS: `app/src/desktop-menu.ts:91`, `:285`, команда `logs.export`;
  - палитра команд: `app/src/app.tsx:332`;
  - страница ошибки: `app/src/pages/error.tsx:268`;
  - диалог зависшего окна: `desktop/src/main/windows.ts:357`;
  - IPC `export-debug-logs`: `desktop/src/main/ipc.ts:110`.
- Тесты: `desktop/src/main/logging.test.ts` (7 сценариев: подложенные секреты, JWT, эхо секрета между файлами, пути Windows/macOS, лимиты, symlink, dump).

### Чего не хватает

1. Архив не привязан к чату: берутся «последние 5 попыток», а не попытки нужной сессии.
2. Нет самого чата (экспорт сессии `{info, messages}`).
3. Редактор не знает реальных секретов пользователя: `createRedactor()` вызывается без `knownValues` (`logging.ts:287`). Пароль, ключ Loginom и токены провайдера маскируются только по шаблонам.
4. Адреса внутренних серверов не маскируются: `redact.mjs:25–35` убирает из URL только учётные данные и секретные параметры, хост остаётся.
5. Нет показа содержимого перед сохранением и выбора места.
6. Нет CLI. `logging.ts` импортирует `electron`, поэтому ядро нельзя переиспользовать.
7. При превышении бюджета сжатого архива — исключение `LOG_EXPORT_BUDGET_EXCEEDED` (`:389`) вместо деградации. Практически недостижимо (несжатый бюджет 19 MiB), но поведение должно быть явным.

## 1. Состав архива

### Где что лежит

Корень профиля Loginom (`<root>`):

- Desktop: `<userData>/loginom` (`desktop/src/main/loginom/desktop-service.ts:14`). `userData` = `appData/<appId>` (`desktop/src/main/index.ts:153–156`).
- CLI: `<profile>/loginom` (`product/src/cli-profile.ts:18–24`, `:37`; передаётся в `opencode/src/cli/standalone-command.ts:81`, `standalone-run.ts:66`). Профиль можно переопределить через `LOGINOM_AI_AGENT_CLI_PROFILE`.
- Каталог состояния runtime: `<root>/runtime` (`loginom-host/src/host.ts:84`).
- `<appId>` для prod — `com.loginom.aiagent`; beta и dev добавляют `.beta` и `.dev` (`product/src/index.ts:37–40`).

| Платформа | Desktop `<root>` | CLI `<root>` (профиль `default`) |
|---|---|---|
| Windows | `%APPDATA%\com.loginom.aiagent\loginom` | `%APPDATA%\com.loginom.aiagent\cli\profiles\default\loginom` |
| macOS | `~/Library/Application Support/com.loginom.aiagent/loginom` | `~/Library/Application Support/com.loginom.aiagent/cli/profiles/default/loginom` |
| Linux | `~/.config/com.loginom.aiagent/loginom` | `${XDG_CONFIG_HOME:-~/.config}/com.loginom.aiagent/cli/profiles/default/loginom` |

Хранилище чатов (opencode): `<data>/loginom-ai-agent.db` (`core/src/database/database.ts:43–49`).

- Desktop: `<data>` = `xdgData/<slug>` (`core/src/global.ts:15`). `xdg-basedir` не различает ОС, поэтому на всех трёх платформах это `~/.local/share/loginom-ai-agent`, на Windows — `%USERPROFILE%\.local\share\loginom-ai-agent`.
- CLI: `<data>` = `<profile>/data` (`global.ts:13–15`, `product/src/cli-profile.ts:31`).
- Сборщик базу напрямую не читает. Чат берётся через API сессий (см. ниже).

### Состав (сессия выбрана)

Привязка сессии к попыткам — без нового индекса и без изменения раскладки:

- `chat = sha256hex(sessionID)` (`loginom-host/src/host-port.ts:222`; `sessionID` — id сессии opencode, `opencode/src/product/turn-lifecycle.ts:29` → `loginom-host/src/adapter.ts:24`).
- Попытки: `<root>/runtime/generations/*/chats/<chat>/attempts/<uuid>/` (`loginom-runtime/src/managed-entry.mjs:145–153`; UUID на каждый запуск runtime, чтобы не затирать упавшую попытку).
- Диагностика сессии ключуется не id чата, а `"dock:" + sessionId` из `session.json` попытки (`client/lib/bridge.mjs:118`, `client/lib/local-diagnostics.mjs:35`). Путь: `<root>/runtime/diagnostics/sha256hex("dock:"+<dock id>)/events.jsonl`.

| # | Файл в архиве | Источник | Desktop | CLI |
|---|---|---|---|---|
| 1 | `chat/session.json` | экспорт сессии `{info, messages:[{info, parts}]}`, формат `opencode export` | renderer: `app/src/utils/session-export.ts:19` `fetchSessionExport` → IPC | in-process `Session.Service` (как `opencode/src/cli/cmd/export.ts:284–285`) |
| 2 | `runtime/attempts/<n>/execution-events.jsonl` | все попытки этой сессии, новые первыми | да | да |
| 3 | `runtime/attempts/<n>/session.json` | метаданные попытки: dock id, ревизия клиента (`client/lib/session.mjs:102`) | да | да |
| 4 | `runtime/diagnostics/<n>/events.jsonl` | по dock id из №3 | да | да |
| 5 | `runtime/startup-failures.jsonl`, `runtime/runtime-close-*.json` | сбои старта и закрытия runtime (`loginom-host/src/supervisor.ts:210`, `:261`); окно 24 ч | да | да |
| 6 | `desktop/<stamp>/main.log`, `renderer.log`, `crash.log`, `network.netlog` | `<userData>/logs/<stamp>/<scope>.log` (`logging.ts:46–50`, `:154`). `crash.log` — файл scope `crash` (`:73`, `:87`); отдельного журнала падений нет | текущий и предыдущий запуск | — |
| 7 | `server/…` | `${XDG_DATA_HOME}/<slug>/log` (`logging.ts:192`). Sidecar Desktop пишет туда только при `LOGINOM_AI_AGENT_DISABLE_LOG_FILE≠1` (`desktop/src/main/sidecar.ts:103–109`) | если есть | `<profile>/data/log` |
| 8 | minidump `*.dmp` | `<userData>/Crashpad` (`logging.ts:83–86`) | только запись в manifest (имя, размер, SHA256, mtime) | — |
| 9 | `manifest.json` | версия, канал, `sourceSHA`, `sourceDirty`, `browserRecovery`, ОС, arch, `process.versions`; выбранная сессия (только хеш), лимиты, список файлов | `desktop/src/main/constants.ts:4–10` | `cli-manifest.json` установленного пакета: `sourceCommit`, `sourceTreeSha256`, `sourceDirty`, `version`, `channel`, `platform`, `arch` (`loginom-host/src/cli-manifest.ts:14–24`) + `InstallationVersion`/`InstallationChannel` (`core/src/installation/version.ts:7–12`) |

Не собираются никогда:

- `browser-profile/` и `artifacts/` попытки;
- `<root>/connection`, `inputs`, `file-references`, `recovery`;
- `auth.json`, `mcp-auth.json`;
- сама база чатов;
- входные файлы пользователя (№8 в #297 — только этапом 2, по отдельному согласию).

Обход каталогов — существующий `collect()` (`logging.ts:199`): без перехода по symlink, только по шаблону.

`public-api.jsonl` из таблицы #297 в production-коде не найден. Пункт снят.

На Windows профиль браузера попытки лежит в `%TEMP%\lb*` (`managed-entry.mjs:158–159`). Он не собирается.

### Без выбранной сессии

Прежнее поведение #549: 5 последних попыток и диагностик по mtime. Нужно для диалога зависшего окна и страницы фатальной ошибки, где чата может не быть. В manifest: `selection: "recent"`.

### Размер

- Лимиты прежние: 2 MiB хвоста на файл (JSONL — с целого события), 20 MiB на архив, не больше 200 файлов.
- Новое — приоритет при нехватке бюджета. Файлы добавляются по порядку, и всё, что не поместилось, получает `status: "omitted", reason: "archive-budget"` в manifest:
  1. manifest;
  2. журналы попыток выбранной сессии, новые первыми;
  3. чат;
  4. диагностика сессии;
  5. журналы Desktop текущего запуска;
  6. сбои старта;
  7. прочее.
- Исключение `LOG_EXPORT_BUDGET_EXCEEDED` остаётся последней защитой. Пользователь его не видит при штатной работе: несжатый бюджет 19 MiB.
- Чат длиннее 2 MiB усекается до последних сообщений целиком (`messages` с конца), с полем `truncated` в manifest.
- «Окно вокруг отказа» из #297 (±N событий операции) — не в этой части. Хвоста 2 MiB хватило в проверке #549: 16,8 МБ → 72 события.

## 2. Обезличивание

### Что есть

- `redact.mjs`:
  - ключи `*password*`, `*token*`, `*secret*`, `*api_key*`, `cookie`, `authorization`;
  - `Bearer`/`Basic`, `sk-…`, `ghp_…`, `glpat-…`, PEM, русские «пароль/токен»;
  - учётные данные и секретные параметры URL;
  - reasoning и system prompt;
  - бинарные вложения.
- `prime()` выучивает значения секретных полей и маскирует их эхо в других файлах. Порядок «сначала prime всех файлов, потом redact» уже соблюдается (`logging.ts:339`).
- `hasExportSecret()` (`logging.ts:229`) — независимая от `redact.mjs` проверка: JWT, ключи, `field=value`. Файл с остатком не попадает в архив.
- Домашний каталог → `~` для POSIX, Windows и JSON-экранированных путей (`logging.ts:244`).

### Чего не хватает → что добавляем

1. **Известные секреты профиля.** До redact сборщик читает в память, только чтобы передать в `createRedactor(knownValues)`; в архив эти значения не пишутся:
   - активное подключение Loginom: `apiKey`, `password` и `username` через `connectionStore(<root>/connection, codec).read()` (`loginom-host/src/connection/connection-store.ts:32`, `:221`). Тот же набор host уже считает диагностическими секретами (`loginom-host/src/supervisor.ts:110`). Codec — штатный: Desktop — `credentials(process.platform)`, CLI — `cliCredentials(...)` (`loginom-host/src/node-entry.ts:108`);
   - ключи и OAuth провайдеров (`access`, `refresh`, `key`) из `<data>/auth.json` (`opencode/src/auth/index.ts:10`);
   - токены MCP из `<data>/mcp-auth.json` (`opencode/src/mcp/auth.ts:37`);
   - пароль sidecar `LOGINOM_AI_AGENT_SERVER_PASSWORD` (`desktop/src/main/sidecar.ts:105`), только для Desktop;
   - `api_key` конфигурации Dock (`loginom-runtime/client/lib/config.mjs:82`), если файл есть.

   Если хранилище не читается (например, заблокирована связка ключей), экспорт продолжается без этих значений, а в manifest пишется `knownSecrets: "unavailable"`. Сами значения, их число и длина в manifest не попадают.

2. **Логин пользователя Loginom.** Он не секрет, но это персональные данные: попадает в пути загрузок `/<username>` (`managed-entry.mjs:140`). Заменяется на `[user]` тем же механизмом known values, с отдельным маркером.

3. **Адреса внутренних серверов.** Отдельный шаг после redact, в сборщике; `redact.mjs` не меняется, поэтому runtime-журналы на записи ведут себя как раньше. Правило:
   - **Оставить:** `*.loginom.ai`, `127.0.0.1`, `localhost`, `::1` (порт оставить), публичные хосты провайдеров моделей из каталога моделей. Без них журнал не разобрать.
   - **Маскировать:** иные хосты в URL, `host:port` и голые IPv4/IPv6 → `host-<первые 8 hex sha256(хост)>`. Хеш стабилен внутри одного архива и позволяет различать серверы, но не раскрывает имя. Сюда входят частные диапазоны (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`) и имена `*.local`, `*.lan`, `*.corp`, `*.internal`.
   - **Прокси:** адрес прокси — внутренний адрес, маскируется. Схема и порт остаются, так виден факт прокси.

4. **Значения ячеек.** Не маскируются: по умолчанию журнал runtime хранит только наблюдения UI. В окне предпросмотра пользователь видит предупреждение «архив может содержать фрагменты ваших данных и текст чата» и может снять галочку «Чат».

5. **Minidump.** Остаётся вне архива, как в #549: в нём память процесса с возможными секретами, обезличить нельзя. В manifest — имя, размер, SHA256 и mtime. Отдельную галочку «приложить дамп» не делаем до решения владельца (открытый вопрос 2).

Порядок обработки файла:

1. Прочитать хвост.
2. `prime` по всем файлам.
3. `redact`.
4. `~` вместо домашнего каталога.
5. Маска хостов.
6. Маска known values.
7. `hasExportSecret`.
8. Записать файл или исключить его с причиной.

Имена файлов в архиве проходят те же шаги.

### Проверка: тест на подложенных секретах

Один сквозной тест сборщика, red на текущем `exportDebugLogs` и green после правки. Секреты кладутся в настоящие хранилища тестового профиля:

- `connection` с фиктивным codec: `apiKey`, `password`, `username`;
- `auth.json`: OAuth `access`/`refresh` и ключ API;
- `mcp-auth.json`: токен;
- env sidecar: пароль.

Затем каждое значение эхом вставляется в журнал попытки, диагностику, `main.log` и чат: как есть, URL-encoded, JSON-экранированно и внутри вложенной JSON-строки. Отдельно в журнал добавляются `http://10.1.2.3:8080/api`, `https://loginom.corp.local/app` и `https://app.loginom.ai/app/`.

Проверка — по сырым байтам архива. Ни одного известного значения ни в одном варианте, ни во внутренних хостах; `app.loginom.ai` сохранён; каждый файл manifest сходится по SHA256 и размеру. Существующие 7 тестов `logging.test.ts` остаются зелёными.

## 3. Интерфейс

### Desktop

- **Где.** Существующий пункт «Справка → Экспортировать журналы…» переименовывается в «Собрать диагностику…» (`desktop.menu.exportLogs` в `app/src/i18n/ru.ts:102` и `desktop-native.ts:247`). Команда `logs.export` прежняя. Тот же пункт есть в меню приложения на macOS. Страница ошибки и диалог зависшего окна вызывают тот же экспорт без выбора сессии. Пункт в «Настройки» не добавляем: два места для одной кнопки не нужны.
- **Сессия.** Renderer передаёт id открытой сессии: `exportDebugLogs({ sessionID, chat })`, где `chat` — результат `fetchSessionExport`. Если сессия не открыта, экспорт без чата, как в #549. Main не ходит в sidecar сам: renderer уже держит клиент SDK.
- **Что видит пользователь.**
  1. Модальное окно «Собрать диагностику». В заголовке — название чата или «без чата».
  2. Таблица групп с галочками: Чат; Журналы выполнения (N попыток); Диагностика сессии; Журналы приложения. Для каждой группы — размер после обезличивания и пропущенные файлы с причиной: «обнаружен секрет», «не поместился», «двоичный файл».
  3. Кнопка «Показать файлы» раскрывает список из manifest: имя, размер, статус. Строка «Открыть» показывает обезличенный текст файла только для чтения, первые 64 KiB.
  4. Предупреждение о данных из раздела 2, п. 4.
  5. Кнопки «Сохранить…» и «Отмена».
- **Подготовка до показа.** Сборщик строит архив в памяти (≤ 20 MiB). Предпросмотр показывает ровно те байты, что будут сохранены, — повторной сборки нет.
- **Куда.** `dialog.showSaveDialog`: по умолчанию `Downloads/loginom-diagnostics-<stamp>.zip`. После сохранения — `shell.showItemInFolder` и тост с путём. Файл создаётся с правами `0600`. Диалог зависшего окна сохраняет сразу в Downloads без предпросмотра: renderer может не отвечать.
- **Сеть.** Не используется. Вызов renderer → main — IPC, без сокетов.

### CLI

```
loginom-ai-agent-cli diagnostics export [--session <id>] [--output <path>] [--no-chat]
```

- По умолчанию сессия — последняя обновлённая в профиле: `Session.Service`, как в `opencode/src/cli/cmd/export.ts`.
- `--output` по умолчанию: `./loginom-diagnostics-<stamp>.zip`. Существующий файл не перезаписывается: код `DIAGNOSTICS_OUTPUT_EXISTS`, выход 1.
- Вывод:
  - stdout — одна строка, абсолютный путь архива;
  - stderr — сводка: включено N файлов, пропущено M, причины.
- Коды выхода: 0 — успех; 1 — ошибка; 2 — неверные аргументы (`CLI_ARGUMENT_INVALID`, как в `standalone.ts:26`); 3 — `PROFILE_BUSY`. Сам экспорт профиль не блокирует, но читает его.
- Host не запускается.
- Регистрация: ветка `diagnostics` в `opencode/src/standalone.ts:9`, рядом с `loginom`, и строка в справке `opencode/src/cli/standalone.ts:18`. Сама команда — новый файл `opencode/src/cli/standalone-diagnostics.ts`.

## 4. Границы

- **Код opencode.** Не трогаем, кроме:
  - своих `loginom-*`/`standalone*`-файлов;
  - двух строк регистрации в `opencode/src/standalone.ts` (тоже наш файл: точка входа standalone-сборки, `opencode/script/build.ts:209`);
  - строки справки в `cli/standalone.ts`.

  `cli/cmd/export.ts` и `index.ts` не меняются.
- **Пути профиля** не меняются. Сборщик только читает и не создаёт каталогов в профиле. Индекс «сессия → попытки» не вводим: попытки ищутся по `sha256(sessionID)`.
- **Без сети.** Нет HTTP, нет отправки, нет обращения к sidecar из main. Чат в Desktop приходит из renderer по IPC.
- **Формат журналов** runtime и `redact.mjs` не меняются.
- **`packages/agent`** и публичный контракт Dock не затрагиваются.
- **Общее ядро.** Новый модуль `loginom-host/src/diagnostics-export.ts` (subpath `@loginom-ai-agent/loginom-host/diagnostics-export`) без `electron`:
  - на вход: корни профиля, опциональные `sessionID` и чат, известные секреты, провенанс;
  - на выход: байты zip и manifest.

  `@zip.js/zip.js` уже есть в зависимостях `loginom-host`. Логику `collect`/`readExportTail`/`writeZip`/`hasExportSecret`/`exportHome` переносим из `logging.ts` без изменений; `logging.ts` становится тонкой обёрткой Electron.

## 5. План работ

| PR | Содержание | Red → green | Проверки |
|---|---|---|---|
| 1 `diagnostics-core` | Перенос ядра из `logging.ts` в `loginom-host/src/diagnostics-export.ts`; выбор попыток по `sessionID`; приоритет бюджета; known values из хранилищ профиля; маска хостов и логина. `exportDebugLogs` вызывает ядро, поведение без сессии прежнее | Новый тест ядра на подложенных секретах (раздел 2) — red на текущем коде: эхо пароля из `connection`, OAuth `refresh`, внутренний хост. Тест выбора: две сессии — в архиве только попытки выбранной. Тест бюджета: чат + 12 больших журналов — пропущены младшие по приоритету, без исключения | `bun test` в `loginom-host` целиком (#447); `logging.test.ts` в `desktop` (7 прежних — зелёные); `required-checks.py list/verify` |
| 2 `diagnostics-desktop` | IPC `exportDebugLogs({sessionID, chat})`, окно предпросмотра с группами и списком файлов, `showSaveDialog`, переименование пункта меню, i18n ru/en | Тест main: IPC с `sessionID` → manifest содержит `selection: "session"` и `chat/session.json` (red: аргумент игнорируется). Тест `desktop-menu.test.ts` на новый ключ. Тест renderer: снятая галочка «Чат» → в архиве нет `chat/` | desktop `bun test` (pinned Node, как в #549); app `bun test` по изменённым файлам; `bun typecheck` — в CI |
| 3 `diagnostics-cli` | `loginom-ai-agent-cli diagnostics export [--session] [--output] [--no-chat]` | Тест standalone: команда на тестовом профиле с подложенными секретами печатает путь, архив без секретов; неизвестный аргумент → код 2; существующий `--output` → код 1 | `bun test` по `opencode/test/cli/standalone*`; сборка CLI на стенде (`build-cli.ts --no-archive`) |

Порядок: 1 → (2 ‖ 3). PR 2 и 3 независимы и зависят только от ядра.

### Ручной сценарий на стенде Windows (один, после PR 2 и 3)

1. В установленном Desktop на Windows пройти чат с одним узлом на `app.loginom.ai`. В настройках прокси указать внутренний адрес.
2. «Справка → Собрать диагностику…». Окно показывает название чата, N попыток, пропуски с причинами. Через «Открыть» видно обезличенный `execution-events.jsonl`.
3. Сохранить в предложенный файл в `Downloads`; проводник открывает папку.
4. Распаковать и проверить:
   - `findstr` по паролю Loginom, логину, адресу прокси и `C:\Users\<имя>` — 0 совпадений;
   - `app.loginom.ai` присутствует;
   - SHA256 файлов совпадают с manifest;
   - `sourceSHA` равен SHA сборки.
5. Повторить через CLI: `loginom-ai-agent-cli diagnostics export --session <id>`. Путь на stdout, та же проверка шага 4.

Итог сценария (PASS/FAIL, SHA, размеры) — в отчёт PR 3. Архив в Git не коммитится.

## Открытые вопросы владельцу

1. Чат включать по умолчанию (галочка стоит) или выключать? Проект предлагает включать: без чата не видно просьбы пользователя (#297: минимум №1 + №3 + №6).
2. Minidump: только запись в manifest (проект) или отдельная галочка «приложить дамп памяти» с предупреждением?
3. Список «публичных» хостов, которые не маскируются: достаточно `*.loginom.ai` + localhost + хосты провайдеров из каталога моделей?

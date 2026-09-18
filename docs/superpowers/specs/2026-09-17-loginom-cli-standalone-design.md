# Loginom AI Agent: самостоятельный CLI и Desktop на общем коде

Дата: 2026-09-17.

Базовый коммит новой реализации:
`c37913ab5ca8f421b76286bf25c282b83cc2de56`
(`chore(desktop): replace application icons with Loginom AI logo`).

Статус: самостоятельный целевой дизайн для новой ветки от указанного коммита.
Направление, назначение CLI и раздельные профили подтверждены пользователем.
Документ содержит полный контракт решения и не требует прежних CLI/service-планов.
Технические детали ниже — проект реализации, а не заявление о готовом коде.

## 1. Результат для пользователя

Desktop используется для обычной работы с агентом. Самостоятельный CLI предоставляет
TUI и `run` для отладки, тестов и benchmark'ов на локальном компьютере.
CLI не требует установленного или запущенного Desktop.

Оба интерфейса используют общий исходный код backend агента v1 и Loginom Dock runtime,
запуская собственные экземпляры. При одинаковых входах и настройках они имеют
одинаковые возможности построения, выполнения, сохранения и проверки сценариев Loginom.

Desktop и CLI запускаются независимо и используют отдельные профили: настройки
Loginom, авторизацию моделей, историю, state, cache и browser profiles.
Перенос настроек допускается только явно. Автоматической синхронизации нет.

Chromium по умолчанию видимый. CLI поддерживает `--headless` для TUI и `run`.
Desktop сохраняет существующий пользовательский интерфейс и видимый браузер.

Целевые платформы:

- Linux x64: Ubuntu 22.04+ и Debian 12+;
- Windows 11+ x64;
- macOS 14+ Apple Silicon arm64.

## 2. Границы

В первую версию входят локальные TUI/run, настройка Loginom, автоматизируемый вывод,
изоляция тестовых прогонов, самостоятельные архивы CLI и проверка Desktop на регрессии.

Не входят:

- единая фоновая служба для Desktop и CLI, discovery и автоматическое подключение;
- общие активные чаты, передача управления, observer mode и синхронизация профилей;
- миграция данных Desktop в новый общий профиль;
- продолжение CLI-задачи через Desktop или фоновой задачи после выхода владельца;
- удалённый Loginom backend, многопользовательский сервер и системный автозапуск;
- отдельная benchmark-платформа, dashboard или scheduler;
- переход на экспериментальный `packages/cli` v2 и переделка Session V2;
- новые интеграции Codex/Hermes/Cursor и перенос сервера знаний.

`serve`, `attach`, `web`, ACP и другие исходные возможности OpenCode не становятся
новыми Loginom-продуктами в рамках этой задачи. Их общий код не следует ломать,
но запуск Loginom через них не объявляется поддержанным. Для таких режимов новые
Loginom-флаги дают понятный отказ, а не незаметный запуск другого backend.

## 3. Проверенная исходная база

Следующие сведения получены чтением файлов именно базового коммита.

| Уже существует | Состояние в базе |
| --- | --- |
| `packages/agent/src/cli/cmd/tui.ts`, `src/cli/tui/worker.ts` | TUI с собственным worker и RPC |
| `packages/agent/src/cli/cmd/run.ts` | Backend в процессе команды, встроенный API transport, JSON events, явный attach |
| `packages/desktop/src/main/server.ts`, `sidecar.ts` | Собственный Electron sidecar, HTTP между UI и backend, приватный порт Loginom |
| `packages/desktop/src/main/loginom/*` | Connection store/service, credentials, recovery, runtime composition и host-port |
| `packages/loginom-host/src/{adapter,transport,supervisor,inputs}.ts` | Backend adapter, private transport, supervised Node/runtime и приём вложений |
| `packages/loginom-runtime` | Встроенные Dock client, managed runtime и Chromium executor |
| `packages/product/src/index.ts`, `loginom-release.json` | Product identity, defaults подключения и pins ресурсов |
| `packages/desktop/src/main/system-proxy.ts` | Linux/GNOME proxy policy; самостоятельной общей native policy для трёх ОС нет |
| `packages/agent/script/build.ts` | Сборка native CLI, пока без законченной самостоятельной Loginom-поставки |
| `packages/desktop/scripts/bundle-loginom.ts` | Ресурсный bundler, явно ограниченный Linux x64 |

В этой базе отсутствуют `createLoginomHost`, вынесенные
`packages/loginom-host/src/connection/*`, CLI profile resolver, CLI credentials
adapter без Electron и продуктовый CLI bootstrap. Их нужно реализовать.
`LOGINOM_AI_AGENT_PROFILE_ROOT` и готовые native ownership/credential adapters
из последующей работы не считаются существующими зависимостями.

Реализация начинается от базового коммита. Нет этапа удаления общей службы,
массового revert или обязательного переноса позднейших коммитов. Позднейшие
наработки не являются предусловием этого дизайна.

## 4. Архитектура процессов

### 4.1. Desktop

Сохранить существующий жизненный цикл:

```text
Electron main
  ├─ собственный backend sidecar ← HTTP → Desktop UI
  └─ Loginom host ← private port → backend sidecar
       └─ комплектный Node + Dock runtime → Chromium
```

Основное изменение Desktop — тонкий адаптер к вынесенной общей логике host.
Electron продолжает предоставлять свои пути, credentials adapter и приватный порт.
Закрытие приложения завершает только его backend и runtime.

### 4.2. CLI

Сохранить исходную модель OpenCode для агента:

```text
CLI invocation / bootstrap
  ├─ TUI → worker с backend v1
  │    либо run → backend v1 внутри процесса команды
  └─ приватный дочерний Loginom host на комплектном Node
       └─ комплектный Node + Dock runtime → Chromium
```

Один CLI invocation владеет одним host; runtime по чатам создаётся по необходимости.
Node host не содержит второй backend агента, не имеет HTTP listener, discovery,
client registry или независимого срока жизни. Он нужен для общего host-кода,
управления runtime и платформенных credentials без зависимости от Electron/Bun ABI.

Для `run` adapter связывается с host непосредственно через приватный транспорт.
Для TUI тот же контракт проходит через локальный bridge worker ↔ CLI owner ↔ host.
Bridge только передаёт сообщения; не принимает решений об инструментах, credentials,
поколениях или сценариях. Его disconnect и отмена являются частью lifecycle.
Bun↔Node IPC требуется проверить реальными процессами; Electron MessagePort нельзя
считать переносимым в CLI без адаптации.

Обычный CLI не открывает сетевой порт ради Loginom. Уже существующий transport
backend/API используется для TUI/run без переписывания Session engine.

## 5. Общие модули и границы ответственности

| Модуль | Ответственность |
| --- | --- |
| `packages/product` | CLI executable name, channel identity, CLI profile layout, resource pins и manifest |
| `packages/loginom-host` | Общие connection/recovery/credentials contracts, runtime supervision, attachment admission, private transport |
| Новый CLI Node host entrypoint в `packages/loginom-host` | Композиция общего host для одного CLI invocation и приватные management requests |
| `packages/agent/src/cli` | Ранний bootstrap, команды, TUI bridge, headless, exit codes и cleanup invocation |
| `packages/agent/src/session` и provider integration | Единственный путь prompts, tools, model requests и permissions для Desktop/TUI/run |
| `packages/desktop/src/main/loginom` | Electron composition, safeStorage adapter, renderer IPC и UI integration |
| `packages/loginom-runtime` | Единственные Dock handlers, Playwright context, выполнение действий и receipts |

Вынести из Desktop в host только независимые бизнес-модули: connection store/service,
recovery и основную логику `desktop-service.ts`/`host-port.ts`.
Electron imports и доступ к `app`, `safeStorage`, `BrowserWindow` остаются в Desktop.
Создать одну фабрику host с явными profile paths, bundle paths, credentials codec,
environment и browser options. Desktop и CLI вызывают эту фабрику через тонкие адаптеры.

Обобщить порт до минимального transport contract, не протаскивать Electron-типы в
host или CLI. Повторно использовать существующие request IDs и структуру вызовов;
добавить проверяемые close/disconnect и ограниченные error codes.

Host не импортирует Agent/Core/Server. Runtime не зависит от выбранного интерфейса.
Соблюдаются направления Schema → Core/Protocol → Server и запрет Client → Core/Server.
Полноценный новый HTTP control API не нужен. Изменение публичного API допускается
только при доказанной необходимости; генерация SDK/Client тогда штатная.

## 6. Профили и ранний запуск

### 6.1. Разделение данных

Desktop сохраняет все существующие пути и данные. CLI получает корень:

| ОС | Корень CLI-профиля по умолчанию |
| --- | --- |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/<channel-app-id>/cli/profiles/default` |
| Windows | `%APPDATA%/<channel-app-id>/cli/profiles/default` |
| macOS | `~/Library/Application Support/<channel-app-id>/cli/profiles/default` |

`channel-app-id` берётся из Product: prod/beta/dev изолированы.
В корне находятся `config/`, `data/`, `state/`, `cache/`, `loginom/` и marker формата
CLI-профиля с каналом. Временные файлы этого профиля размещаются внутри его cache.

Добавить новую переменную `LOGINOM_AI_AGENT_CLI_PROFILE` для явного абсолютного
корня профиля. Она относится только к CLI. Desktop не меняет свои пути при её наличии.
Корень канонизируется; aliases/symlinks не должны давать двух владельцев одного
каталога. Корень с несовместимым форматом/каналом отклоняется до открытия БД.
Desktop-каталог нельзя автоматически принять за CLI-профиль или заполнить его marker.

Backend CLI получает единый набор этих путей для Global/Auth/Config/Database,
session state, cache, tmp, inputs и host. Отдельный проект продолжает определяться
существующей логикой OpenCode. Проектные инструкции и конфигурация читаются штатно,
но не дают неявного доступа к глобальным данным Desktop.

Перенос настроек — явное действие пользователя. Для первой версии достаточно
повторного setup и копирования выбранных несекретных параметров. Автоматический
импорт истории, secrets или живой SQLite не нужен. Model auth настраивается отдельно.

### 6.2. Bootstrap до побочных эффектов

В базовом `src/index.ts` команды статически импортируются до yargs, а `Global`
создаёт каталоги при импорте. Поэтому недостаточно добавить profile middleware.
Нужен минимальный CLI entrypoint, который до импорта backend/config/database:

1. Определяет команду, target bundle, канал и CLI profile root.
2. Обрабатывает help/version без host, browser, profile migration и создания БД.
3. Для работающей команды захватывает профильный guard и подготавливает пути/env.
4. Настраивает proxy/CA до загрузки сетевых клиентов.
5. Создаёт нужный приватный host/bridge и затем загружает существующую команду.

Host и backend считаются готовыми к Loginom только после успешного handshake.
Host может лениво создавать Chromium; providers/auth/help не должны открывать браузер.
Ошибки bootstrap не превращаются в успешный чат без Loginom-tools.
Entry в собранном binary и dev entry используют один bootstrap contract.

### 6.3. Один writer на CLI-профиль

Один CLI invocation владеет профилем до полного завершения своего backend/host.
Другой writer получает `PROFILE_BUSY`; параллельные benchmark workers получают
разные профили. Это сознательное ограничение простоты, не система session leases.

Для первой версии достаточно консервативного guard на атомарном создании каталога
lock с owner nonce. Освобождение — только владельцем после завершённого cleanup.
Нельзя удалять lock по таймеру, считать один PID доказательством смерти владельца
или автоматически захватывать его после предполагаемого crash.
Базовый `Flock` использует stale timeout, поэтому его нельзя без изменений выдавать
за такой guard. Не требуются native OS-lock addon, heartbeat и process discovery.

Цена упрощения: после аварийного выхода может остаться lock. Новый запуск сообщает
об этом и предлагает отдельный профиль либо ручное offline-восстановление после
полного завершения процессов прежнего запуска. Автоматический lock recovery в
первую версию не входит. `loginom recover` подтверждает операции, а не снимает lock.

Все CLI entrypoints, способные писать профиль, включая setup, model auth, config,
import/delete и DB maintenance, проходят тот же guard. Для неподдержанного writer
лучше явный отказ, чем незаметный обход bootstrap. Для read-only команд не обещать
отсутствие записей без проверки их реального import path.

## 7. Контракт одинакового построения сценариев

У обоих интерфейсов общие:

- backend prompt loop и регистрация `loginom_*` tools;
- `loginom_dock_prepare`, инструкции Loginom и подключение сервера знаний;
- исходные tool schemas, provider-specific преобразования и runtime validation;
- Dock client/handlers, authenticated Playwright context, Node/browser pins;
- generation lifecycle, admission вложений, cancel, recovery и receipts.

Текущую фразу system prompt о credentials, управляемых «desktop», заменить одной
нейтральной формулировкой про host. Не вводить CLI-specific инструкции о том, как
строить сценарии, или альтернативную реализацию инструментов для benchmark.

Для сравнения выровнять source build, model/provider, agent, настройки генерации,
лимиты, permissions, skills/plugins, system/project instructions, knowledge endpoint
и доступную ревизию action manifest, исходный prompt и содержимое вложений.
Также выровнять исходное состояние Loginom и отдельно фиксировать browser mode.

Различаться могут интерфейс и transport, а не правила действий Loginom.
Одинаковость не требует побайтово одинакового LLM-ответа, `.lgp` или последовательности
tools. Критерии — одинаковые возможности и корректный семантический результат.
При стохастической модели использовать повторные прогоны; seed учитывать только
если provider действительно его поддерживает.

CLI не получает скрытых дополнительных разрешений. Non-interactive `run` не ждёт
невидимого вопроса: явно разрешённые действия выполняются, остальные отклоняются
с диагностикой. Существующие опасные auto-approve flags не включаются автоматически.
В benchmark политика разрешений задаётся явно и совпадает с сравниваемым Desktop.

## 8. Chromium, окружение и вложения

### 8.1. Режим браузера

Режим задаётся на один локальный запуск, до создания runtime:

- TUI/run без флага: `headless=false`;
- `--headless`: `headless=true`;
- `--no-headless`: явный возврат к видимому режиму;
- Desktop: существующий headed режим;
- validation/readiness: headless независимо от рабочего режима.

Продолжение CLI-чата использует режим текущего запуска. Сохранение режима в истории
и live switch API не требуются. Уже работающий Chromium не переключается на лету.
Каждый новый browser attempt имеет собственную identity; receipts сохраняются.
Mode и graphics context передаются доверенным bootstrap, не аргументами LLM tools.

На Linux headed без DISPLAY либо пригодной Wayland-сессии даёт ограниченную ошибку
с предложением `--headless`, без автоматической смены режима. Headless не наследует
DISPLAY/Wayland variables. Окружение конкретного child формируется отдельно, без
изменения process-wide env ради отдельного чата. Sandbox не отключается.
Headless не меняет OAuth-flow модели и сам по себе не обещает поддержку SSH/CI.

### 8.2. Прокси и ресурсы

Вынести пригодную общую proxy policy из Desktop и применить до OAuth/LLM/Dock.
Сохранить Linux/GNOME manual proxy precedence над shell, HTTP/HTTPS environment,
system CA и loopback bypass. На Windows/macOS подтвердить соответствующий адаптер
на реальной ОС; Linux policy не выдавать за уже готовую кроссплатформенную.
PAC/SOCKS/authenticated proxy не объявляются поддержанными без реализации и проверки.
Proxy diagnostics не публикуют credentials.

Ресурсы выбираются по manifest своего bundle. Никакого поиска глобального Dock,
Node или Chromium как fallback. Browser и public MCP tools используют один
authenticated Playwright context внутри данного runtime.

### 8.3. Вложения и тестовая изоляция

CLI `--file` передаёт байты явно выбранного пользователем файла через тот же
admission, что Desktop. Имя/path, придуманные моделью, не дают доступа к диску.
Сохраняются размерные ограничения, SHA, user-message identity и связь chat/attempt.
Token контекста и secrets не попадают в tool parameters.

Разные профили не изолируют Loginom-сервер и рабочий checkout. Параллельным тестам
нужны отдельные имена/пути Loginom-пакетов, выходные каталоги и при необходимости
аккаунты/тестовые области. Benchmark использует подготовленный workspace и не
наследует незаявленный контекст предыдущего прогона.

## 9. Подключение Loginom и хранение секретов

Сохранить единую бизнес-логику настройки: check candidate → save, revisions,
active/pending generations, preserve/replace/empty и блокирование смены используемого
поколения. CLI terminal UI и Desktop form являются адаптерами к одной реализации.

Четыре поля: API-ключ, URL Loginom, имя пользователя, пароль.
Defaults берутся из Product: `http://logi-test-plan.bg.local/app/`, `user`, пустой
пароль без placeholder. Не спрашивать отдельный dataset folder и не проверять
`/<username>` во время setup. Настройка model provider остаётся отдельной.

Desktop сохраняет свои форматы credentials и safeStorage adapter.
Для CLI создать отдельный codec: Linux — plaintext в файлах `0600`/каталогах `0700`;
Windows — пользовательская защита DPAPI; macOS — Keychain. Нет silent plaintext
fallback на Windows/macOS и нет требования расшифровывать Electron ciphertext.
Codec выполняется в комплектном Node; асинхронные платформенные операции допускаются
общим store contract. Схемы новых CLI envelopes/refs нужно определить при реализации,
сохранив чтение существующих Desktop records без обязательной миграции.

Credentials идут по private IPC, не в argv, URL, model history или обычные логи.
Windows ACL и native secret operations проверяются на Windows, Keychain — на macOS.
Чужой профиль не используется при недоступном собственном secret store.

## 10. Команды и автоматизация

Команда standalone дистрибутива — `loginom-ai-agent-cli` (`.exe` на Windows).
Существующий Desktop launcher `loginom-ai-agent` не переназначается.

```sh
loginom-ai-agent-cli
loginom-ai-agent-cli --headless
loginom-ai-agent-cli run "Создай сценарий"
loginom-ai-agent-cli run --headless --format json --file sales.csv "Создай сценарий"
loginom-ai-agent-cli loginom setup
loginom-ai-agent-cli loginom check
loginom-ai-agent-cli loginom status
loginom-ai-agent-cli loginom cancel-pending
loginom-ai-agent-cli loginom recover
```

Это целевые команды, а не утверждение об их наличии в базовом коммите.
При явном `--no-headless` используется та же семантика в TUI и run.

TUI предлагает setup при отсутствии подключения; обычный чат можно открыть без него.
Desktop сохраняет текущий onboarding. Product `run` требует настроенный Loginom
до допуска prompt, не угадывает назначение запроса и не запускает мастер.
Missing model auth и missing Loginom config диагностируются раздельно.

`setup` скрывает secrets при вводе. Для автоматизации предусмотреть
`setup --stdin-json`: секреты приходят через отдельный stdin этой команды, не argv.
Отсутствие значения и явное пустое значение должны сохранять preserve/empty semantics.
Поток prompt stdin в `run` не используется как канал setup.

Сохранить существующий JSON event stream `run`; progress/диагностика идут в stderr,
stdout не загрязняется banner и host logs. Для management команд предоставить
`--format json` с ограниченными result/error codes без секретов.

| Exit code | Значение |
| --- | --- |
| 0 | Команда завершена без диагностированной ошибки выполнения |
| 1 | Ошибка выполнения, provider, runtime или окружения |
| 2 | Неверные аргументы или обязательная настройка отсутствует |
| 3 | Профиль занят или конфликт локального состояния |
| 4 | Требуется разрешение неопределённой Loginom-операции |
| 130 | Пользовательская отмена |

Код 0 не доказывает правильность сценария: её проверяет отдельный oracle.
Нельзя вернуть 0 при итоговом session error, отклонённом обязательном действии,
неустранённой ошибке инструмента или unresolved recovery только потому, что поток
LLM завершился. Ошибка инструмента, исправленная в ходе успешного выполнения,
остаётся в events, но сама по себе не делает итог неуспешным. В конце run проверить
итоговое состояние; точечные изменения обработки сохраняют совместимость JSON events.

Для benchmark достаточно внешнего runner над `run --format json`, разных профилей
и отчёта: source/artifact hashes, model/config, input hashes, knowledge/runtime
versions, browser mode, exit code, oracle result, duration и доступный usage.
Секреты и полный приватный model context в отчёт не входят.

## 11. Отмена, завершение и восстановление

При штатном завершении: запретить новые операции → отменить активную работу →
дождаться завершения уже принятых IPC и закрытия runtime/browser → закрыть host,
backend/worker и приватные каналы → освободить guard профиля.
Timeout не означает, что внешняя операция не произошла. Невозможно подтвердить
cleanup — оставить профиль заблокированным и показать ошибку, не объявлять успех.

При смерти CLI owner дочерний host замечает disconnect и закрывает свои runtime.
При потере host backend прекращает допуск Loginom-вызовов; не запускает replacement
host автоматически посреди операции. В обоих случаях lock может остаться по §6.3.
Завершение CLI не трогает Desktop и другие CLI-профили.

Внутри одного backend сохранить обычное поведение OpenCode для разных чатов и
дочерних задач. Их runtime и отмена привязаны к реальной session identity; общий
host не должен смешивать вложения или interrupt соседнего чата. Не добавлять
межпроцессную передачу задач и новые независимые background drains.

Перед потенциально изменяющим runtime dispatch пишется durable journal entry.
Известное завершение фиксируется; неопределённость сохраняется и видна без рестарта.
Обычный acquire/prompt не даёт разрешения повторить такую операцию.
`recover` — отдельное явное подтверждение после проверки состояния пользователем,
без повторного tool call, удаления receipts или предположения об откате Loginom.

При выделении host из базы проверить существующие recovery/cancel ограничения:
базовый `pending()` отражает recovered-on-open записи, а host-port может пытаться
возобновлять recovery lease при acquire. Это не готовое доказательство нового
контракта. Нужны локальные исправления: live uncertainty, запрет неявного resume,
проверка idle перед acknowledge и удержание ресурсов до завершения всех принятых
операций, включая admit/list/interrupt. Не строить для этого client fencing API.

## 12. Сборка и установка

CLI архивы:

- `loginom-ai-agent-cli-<version>-linux-x64.tar.gz`;
- `loginom-ai-agent-cli-<version>-darwin-arm64.tar.gz`;
- `loginom-ai-agent-cli-<version>-win32-x64.zip`.

Состав: native CLI/TUI, Node host entry и его полная dependency closure, комплектный
Node, Dock/runtime/Playwright, Chromium, manifests, licenses/notices, install script
и инструкция удаления. Полного Node backend bundle общей службы нет.

Выделить staging ресурсов из существующего Desktop bundler в общий build helper
с target/output parameters. Desktop и CLI используют одинаковые sources/pins;
физические каталоги установок независимы. Agent native build должен включать новый
ранний CLI entry и необходимый TUI worker; нельзя считать существующий build script
законченной поставкой Loginom без этого подключения.

Manifest фиксирует source commit, target/arch, product version, версии зависимостей,
пути и hashes payload. Native pins добавляются по реальным проверенным файлам;
отсутствие Windows/macOS ресурса — ошибка сборки, не подстановка Linux hash.
Ни runtime startup, ни install script не скачивают npm packages или browser.
Системные библиотеки ОС перечисляются отдельно.

Standalone устанавливается в отдельный versioned каталог; Unix user launcher
`~/.local/bin/loginom-ai-agent-cli`, Windows user Programs + явный user PATH.
Uninstall удаляет только собственный launcher/payload; пользовательские профили,
Desktop installation и чужие PATH entries сохраняются. Update выполняется после
остановки процессов старой версии. Upstream install/update endpoints не используются.

Desktop сохраняет DEB/AppImage, EXE, DMG, app IDs, URI handler, иконки и GUI launcher.
Включать CLI внутрь Desktop в первой версии не требуется. AppImage закрывает свои
процессы до освобождения mount; payload не обязан жить после выхода GUI.

Linux sandbox должен работать в standalone архиве на поддержанной ОС. Если user
namespaces запрещены, документировать системную установку доверенного root-owned
sandbox helper либо явный отказ запуска. Не обходить ограничения `--no-sandbox`.
Подписи, notarization, лицензии и notices проверяются по фактическим ресурсам.
Отсутствующие signing credentials дают dev-only/BLOCKED, а не release PASS.

## 13. Приёмка

| ID | Наблюдаемое доказательство |
| --- | --- |
| IND-01 | Установленный standalone CLI без Desktop/Node/Bun/Chrome в PATH запускает TUI и run с комплектными ресурсами, без startup downloads |
| IND-02 | Desktop/TUI/run одного source build получают одинаковые Loginom instructions, tool schemas и runtime pins |
| IND-03 | Одинаковый CSV/prompt и настройки: сценарий построен, выполнен, сохранён, холодно переоткрыт; независимый readback результата совпадает во всех интерфейсах |
| IND-04 | TUI и run отдельно проверены headed/headless; видимость окна соответствует режиму; resume использует режим запуска |
| IND-05 | Вложения с одинаковыми именами в разных чатах/профилях не смешивают bytes, receipts, browser state и удалённые пакеты |
| IND-06 | CLI не читает и не изменяет Desktop global config/auth/history; закрытие одного интерфейса не прерывает другой |
| IND-07 | Второй writer профиля получает busy; aliases корня не обходят guard; разные benchmark profiles выполняются параллельно |
| IND-08 | Help/version не запускают host/browser и не создают БД; все mutating команды используют правильный профиль до imports |
| IND-09 | Setup/check/preserve/replace/empty/pending/cancel/recover соответствуют единой host-логике; run не зависает на скрытом вводе |
| IND-10 | Ctrl+C, crash owner/host/runtime/browser, разрыв сети после dispatch: cancel/cleanup, durable recovery, отсутствие автоматического replay |
| IND-11 | Private attachment admission, permissions и secret boundaries одинаковы; CLI не получает скрытый auto-approve |
| IND-12 | JSON events, итоговые ошибки и exit codes наблюдаемы внешним runner; профиль нового benchmark не наследует незаявленный контекст |
| IND-13 | Proxy до OAuth/LLM/Dock, loopback bypass, CA, native credentials, headed environment и sandbox подтверждены на target ОС |
| IND-14 | Архив/manifest/install/uninstall проверены; Desktop установленной сборки прошёл regression после extraction host |

Минимальный функциональный oracle: CSV с числовым столбцом `amount`, значения
10, 20, 25 → импорт → сумма 55 → save → закрытие → reopen/readback.
Для проверки изоляции второй файл с тем же именем содержит 40, 60, 1 → сумма 101.
Каждый прогон использует отдельный Loginom package path. Oracle читает фактические
данные/структуру результата, а не принимает текстовый ответ модели за доказательство.
Эти fixtures и их hashes должны быть сохранены в тестовом наборе.

Contract tests отдельно сравнивают инструкции, каталог tools и передачу входов.
Real-process tests проверяют bridge, disconnect и cleanup. Live прогоны проверяют
настоящие Chromium/Loginom/model provider и установленный артефакт.
Headless прогон не доказывает видимое окно; fixture child не доказывает Chromium.

Отчёты содержат PASS/FAIL/BLOCKED/NOT_RUN по каждому ID, source/artifact hashes,
target, mode и конфигурацию сравнения. Нативные Windows/macOS результаты требуют
запуска на этих ОС; контейнерный Linux не заменяет реальный GUI и native acceptance.
Исторические Desktop PASS не переносятся на новую CLI-сборку.

## 14. Этапы реализации из базового коммита

1. **Основа независимого CLI.** Ранний entrypoint, product identity/profile layout,
   guard и help/version. Проверить отсутствие обращений к Desktop данным.
2. **Общий host.** Вынести независимую Loginom-логику из Desktop, сохранить его
   адаптер и поведение; реализовать CLI Node host и private bridge с cleanup.
3. **Первый полный run.** Подключить тот же Loginom tool pipeline, setup и headed/
   headless; пройти реальный CSV → save/reopen oracle и сравнить с Desktop.
4. **TUI и автоматизация.** Подключить TUI тем же bootstrap; проверить resume,
   permissions, JSON/exit codes, profiles, attachments и локальные recovery cases.
5. **Linux-дистрибутив.** Общий staging helper, полный CLI archive, install/uninstall,
   sandbox, установленный CLI и Desktop regression.
6. **Native цели.** Windows/macOS codecs, resources, packaging и настоящая приёмка
   каждой ОС. Подготовка может идти независимо от Linux; готовность учитывается отдельно.

После каждого этапа фиксировать реальный checkpoint и проверки. Не строить сначала
платформу управления клиентами или дополнительную систему миграции.
Новый implementation plan должен следовать этим этапам и IND-01…14.

В новой ветке актуализировать корневой и owning AGENTS.md, checkpoint и CLI runbook
под этот дизайн. Старые CLI/service документы пометить историческими, если они есть
в базе; не использовать их как параллельную действующую спецификацию. Исторические
отчёты и доказательства не переписывать.

Проверки выполняются из соответствующих package directories. Использовать
`bun typecheck`, не прямой tsc. Изменения public HttpApi требуют штатной регенерации
SDK/Client; если HTTP contract не меняется, новый control API ради CLI не добавлять.

## 15. Статус этого документа

Для подготовки прочитаны исходники базового коммита и учтены подтверждённые решения
пользователя. Документ самодостаточен и может быть перенесён в новую ветку отдельно.
При его создании ветка не переключалась, код и установленные приложения не менялись,
реализация и runtime acceptance не запускались.

## 16. Ход реализации

### Текущая сводка — 2026-09-18

Полная цель не завершена. Ниже сохранены исторические checkpoint-записи;
незакрытый пункт в ранней записи не отменяет последующую проверку, а старый PASS
не переносится автоматически на новые artifacts или другую ОС.

- Этапы 1–2: CLI bootstrap/profile/guard и shared private Node host реализованы;
  Linux source/process/installed проверки и Desktop regression выполнены.
  Platform-specific credential/proxy acceptance остаётся частью этапа 6.
- Этапы 3–4: CSV save/cold-reopen, TUI/run, resume, permissions и crash/network
  recovery имеют Linux evidence ниже. Model provider в oracle scripted;
  требуемый настоящий provider ещё не проверен.
- Этап 5: несколько Linux development archives прошли install/uninstall и runtime
  acceptance; installed Desktop 02:25 прошёл CSV 55/101 и cold reopen, затем
  восстановлена стабильная 0.1.4. Notices candidate 04:30 прошёл build/manifest/archive и штатную установку,
  help/version, installed notices и удаление; затем browser/runtime crash после
  active import с настоящим Loginom и scripted provider.
- Этап 6: Windows/macOS source и cross-build подготовлены; реальных native
  install/credential/browser/GUI прогонов нет. Это не native acceptance PASS.
- Release gates остаются открыты: настоящий model provider, native OS,
  clean release/signing/notarization и полный license/source-distribution audit.
  Архив 05:00: 465 npm notices, 464 README, 32 native + 3 JS source files,
  Linux Chromium credits (757 секций); 3 npm entries и другие audit gaps остаются.

Актуальные ссылки: [CLI runbook](../../testing/loginom-ai-agent/standalone-cli.md),
[licenses report](../../testing/loginom-ai-agent/reports/2026-09-18-cli-license-inputs/report.md).

### История реализации с 2026-09-17

Актуальный checkpoint 2026-09-17: реализация ведётся в ветке `loginom-cli`
от указанного базового коммита. Исходный пользовательский документ сохранён;
этот раздел дополняется по результатам работ. Установленный Desktop не изменяется.

### Этап 1 — в работе

- [x] Отдельное имя `loginom-ai-agent-cli`; Node-only resolver профилей Linux/Windows/macOS с prod/beta/dev и tmp внутри cache.
- [x] Атомарный directory guard с nonce, канонизацией symlink aliases и отказом повторному writer. Автоматического снятия после crash нет.
- [x] Marker формата/канала, отказ неизвестным непустым каталогам и symlink-подкаталогам; зарезервированные корни Desktop отклоняются.
- [x] Минимальный entry с help/version без backend, host, браузера и профиля.
- [x] Передача профильных путей в Global до его import; устранение inherited Desktop DB/config/auth overrides и неявного home config fallback.
- [x] Исторический shared-service дизайн помечен; актуализированы AGENTS, Linux checkpoint и отдельный CLI runbook.
- [ ] Подключить реальные команды к этому bootstrap, proxy/CA и host handshake; проверить все writer entrypoints.
- [ ] Подтвердить собранный native entry и отсутствие обращений к Desktop глобальным данным при реальной работе.

Проверки: Product — 4 теста/16 assertions и `bun typecheck` PASS; Core —
`bun typecheck` PASS. Agent guard и процессные проверки entry/изоляции —
8 тестов/36 assertions PASS. Agent `bun typecheck` PASS
после исключения старых сгенерированных `dist` из области проверки.

### Следующие этапы

- [ ] Этап 2: общая фабрика host, Desktop adapter, CLI Node host/bridge/cleanup.
- [ ] Этап 3: полный run и реальный oracle с Desktop-сравнением.
- [ ] Этап 4: TUI/automation/resume/permissions/JSON/exit codes/recovery.
- [ ] Этап 5: установленный Linux archive и Desktop regression.
- [ ] Этап 6: native Windows/macOS codecs, ресурсы, упаковка и приёмка.

### Этап 2 — начат параллельно подключению entry

- [x] Connection store/service, credential codec и recovery store вынесены в `packages/loginom-host/src/connection` без Electron imports. Desktop сохраняет совместимые re-exports и свои тесты.
- [x] Общая фабрика `createLoginomHost` принимает пути, codec, snapshot окружения и browser mode; Desktop composition заменена тонким Electron adapter.
- [x] Host явно объявляет Schema/Product/Effect dependencies; lockfile изменён только для этих зависимостей.
- [x] В supervisor окружение передаётся отдельно от start IPC и фильтруется; provider credentials не проходят в runtime.
- [x] Общий host-port без Electron imports; leases удерживаются для call/list/admit/interrupt до фактического завершения, включая release во время запроса.
- [x] Live uncertainty видна в status; последующий успешный вызов не удаляет её. Убрано неявное resume recovery lease. Явный acknowledge требует idle, сбрасывает runtime чатов и сохраняет journal при shutdown до commit.
- [x] CLI Node entry и client, private protocol handshake, management dispatcher и штатный close после завершения принятых requests. Собрана Node dependency closure и проверен настоящий дочерний процесс.
- [x] Bootstrap подключён к `loginom status --format json`: профиль и guard → Node host → чистый JSON → подтверждённый exit → освобождение guard.
- [x] Management setup/check/status/cancel-pending/recover подключены к общей host API; stdin JSON различает preserve/replace/empty, отсутствует скрытый ввод при автоматизации, recovery требует явного подтверждения.
- [x] Исходная форма interactive setup со скрытыми секретами и выводом в stderr; TTY acceptance ещё не выполнена.
- [x] Linux proxy policy вынесена из Desktop в общий Host и применяется до CLI network clients. Комплектный Node запускается с поддерживаемым `--use-system-ca`; explicit extra CA передаётся в host/runtime.
- [ ] TUI/run и обнаружение установленного bundle.
- [ ] Подключение awaitable host-port close к owner lifecycle, отмена runtime при disconnect и полное доказательство cleanup процессов.
- [x] Async codec contract и собственный versioned CLI Linux secret format; Desktop records совместимы.
- [ ] Native DPAPI/Keychain implementations/acceptance — этап 6; сейчас нет plaintext fallback на Windows/macOS.

Проверки extraction: Desktop connection suite — 30 тестов/86 assertions PASS;
Host — 5 тестов/21 assertion PASS, включая реальный private child на комплектном
Node из `packages/desktop/resources/loginom/bin/node`. `bun typecheck` Host,
Desktop и Agent — PASS. Это не Chromium, Loginom или установленный Desktop regression.

Следующая исходная проверка этапа 2: Desktop connection suite — 33 теста/
100 assertions PASS, включая release во время call/list/admit/interrupt; Host —
8 тестов/38 assertions PASS, включая idle recovery, shutdown race и реальный
client transport disconnect на комплектном Node. Typecheck Host/Desktop/Agent PASS.
Transport отклоняет текущие и будущие запросы после close и не раскрывает произвольный
текст ошибки peer. Sidecar подписан на закрытие приватного порта.

Выявленное ограничение среды: Bun 1.3.11 не доставляет `worker_threads.MessagePort`
close в проверенном сценарии (3/3 повторения), в отличие от Node. Интеграционный
тест транспорта выполняется комплектным Node с настоящим MessageChannel и исходным
transport.ts. Для будущего Bun TUI bridge нужна явная доставка disconnect через
RPC/worker lifecycle; результат Node-теста не доказывает её.

Проверки после Node integration: Host — 12 тестов/53 assertions PASS,
включая built Node child handshake/status/close и async CLI secrets; Agent CLI —
9 тестов/42 assertions PASS, включая фактический entry → Node status → exit без
создания Desktop/runtime каталогов. Typecheck Host/Agent PASS. Desktop connection
suite повторно проходит после async codec extraction (33 теста/100 assertions).

Проверки management-пути: Agent CLI — 11 тестов/78 assertions PASS; Host —
12 тестов/55 assertions PASS; Desktop proxy suite — 5 тестов/19 assertions PASS.
Typecheck Agent/Host/Desktop PASS. Процессный fixture проверяет setup → второй setup
с preserve и empty → check/cancel → recover, отсутствие секретов в JSON/stderr
и освобождение guard после ошибок ввода. Runtime в этом тесте — управляемый fixture,
не Chromium/Loginom. Исправлена обнаруженная гонка handshake/restore: перед ready
host дожидается settled; три последовательных повторения regression PASS.

Ограничение checkpoint: доступны help/version, management-команды `loginom` и
исходный `run` с preflight (см. этап 3 ниже); TUI ещё не подключён. Development bundle передаётся явным
`LOGINOM_AI_AGENT_CLI_BUNDLE`; installer/manifest validation ещё не подключены.
IND-01…14 для установленного артефакта остаются NOT_RUN.
Подробности: [CLI runbook](../../testing/loginom-ai-agent/standalone-cli.md).

Порядок оставшейся реализации и gates: [implementation plan](../plans/2026-09-17-loginom-cli-standalone.md).


### Этап 3 — подключён исходный run, приёмка впереди

- [x] Общий resolver development bundle для management/run; приватный host подключается к существующему LoginomHost adapter.
- [x] Loginom preflight до импорта backend: unconfigured → 2 без создания DB; recovery → 4; неподготовленное подключение отклоняется.
- [x] Существующий v1 RunCommand подключён через отдельный bootstrap; прямые exits внутри handler позволяют standalone выполнить cleanup.
- [x] Явное закрытие event subscription и отдельного HttpApiApp scope перед AppRuntime/host; процессная регрессия зависания на ошибке модели устранена.
- [x] Исходный процессный тест: после fixture setup ошибка несуществующей модели выдаёт JSON error, exit 1 и освобождает guard. Проверяется отсутствие setup secret в выводе.
- [ ] Успешный provider/tool prompt, model auth commands, SIGINT и полная семантика exit codes.
- [ ] Живой Loginom CSV/save/cold-reopen oracle и Desktop-сравнение.

Проверки этого checkpoint: Agent CLI — 11 тестов/87 assertions PASS;
Agent `bun typecheck` PASS. Fixture Loginom не запускает Chromium;
проверка ошибки модели не обращается к внешнему provider и не доказывает успешный run.

Регрессия существующего noninteractive RunCommand: 13 процессных тестов/47 assertions
PASS (успех, tools, permissions, JSON, attach и SIGINT legacy entry). Это не подтверждает
SIGINT нового standalone entry. `git diff --check` PASS.


Дополнение этапа 3: успешный исходный standalone prompt с локальным HTTP-provider
и private host tool pipeline подтверждён процессным тестом. Конфигурация модели
читается из CLI profile/config; модель вызывает `loginom_probe`, настоящий Node host
передаёт вызов управляемому runtime fixture, результат инструмента попадает в JSON,
модель продолжает ответ, exit 0 и guard снят. Permission разрешён явным
`--dangerously-skip-permissions` только в этом тесте; скрытого auto-approve нет.

После подтверждённого backend/host cleanup и освобождения guard entry явно завершает
процесс, предварительно сбрасывая stdout/stderr: Bun после успешного provider request
сам не завершался, хотя все наши scopes и дочерние процессы уже закрылись. Ошибка
cleanup не попадает в этот успешный путь и сохраняет guard. Причина оставшегося
process-global handle в зависимостях не установлена; это не доказательство cleanup
живого Chromium. Временная диагностика удалена.

- [x] Успешный исходный provider → Loginom tool fixture → continuation → JSON → exit 0.
- [ ] Реальный Loginom/Chromium oracle, SIGINT standalone и platform acceptance остаются открытыми.

Процессная проверка: 2 теста/51 assertion PASS. Использованы локальный test provider
и управляемый runtime fixture; установленные артефакты не изменялись.

Итоговая CLI-подборка после этой правки: 11 тестов/94 assertions PASS,
Agent `bun typecheck` и `git diff --check` PASS.


### Этап 4 — исходная семантика отказа в permission

- [x] Неинтерактивный standalone `run`, отклонивший запрошенное разрешение,
  выдаёт JSON error `CLI_PERMISSION_REJECTED` и exit 1, даже если модель затем
  завершает текстовый ответ. Существующие tool events сохраняются.
- [x] Процессная проверка при явно заданной политике `loginom_*: ask`:
  с явным dangerous flag инструмент выполнен и exit 0; без флага запрос отклонён,
  exit 1, guard освобождён. Политика по умолчанию этим тестом не переопределяется.
- [ ] Прямой policy deny без permission.asked, неисправленные/исправленные tool errors,
  SIGINT standalone и TUI остаются незавершёнными.

Проверки: 2 процессных теста/55 assertions PASS; Agent typecheck PASS,
`git diff --check` PASS. Тест использует локальный provider и runtime fixture.


Дополнение этапа 4 — отмена активного provider turn:

- [x] SIGINT во время noninteractive standalone run вызывает штатный session.abort;
  повторные сигналы не запускают параллельные abort requests. Команда дожидается
  отмены и event loop, выдаёт `CLI_CANCELLED`, затем штатный cleanup и exit 130.
- [x] Процессный тест с зависшим локальным HTTP-provider: SIGINT → JSON cancellation,
  exit 130 и освобождение guard; Agent typecheck PASS, 2 теста/59 assertions PASS.
- [ ] Отмена на раннем startup/setup, в TUI и при активном внешнем Loginom effect
  требует отдельных implementation/acceptance checks. Этот тест не доказывает
  прекращение операций Chromium или отсутствие внешних эффектов после timeout.

Обработчик снимается после завершения run; legacy entry не получает новый signal
handler. При ошибке abort команда не сообщает подтверждённую пользовательскую отмену.

Повторная регрессия legacy RunCommand после permission/SIGINT изменений:
13 процессных тестов/47 assertions PASS; `git diff --check` PASS.


Дополнение bootstrap/model management:

- [x] Команды `providers` (`auth`) и `models` направлены в существующие backend
  команды после выбора и guard CLI-профиля. Они не запускают Loginom host,
  не требуют Loginom setup или runtime bundle. Help дополнен командами.
- [x] Backend AppRuntime закрывается до освобождения guard; command failure
  возвращает ограниченный code, ошибки cleanup сохраняют guard.
- [ ] Interactive provider login/logout и live OAuth acceptance пока не выполнены;
  наличие dispatcher не является доказательством входа в реальный аккаунт.

Исходная проверка `providers list`: чистый CLI-профиль, отсутствующий runtime bundle,
нет наследования inline Desktop credentials, нет Desktop/runtime каталогов,
штатное освобождение guard. Agent typecheck PASS.

Повторная проверка entry/model management: 5 тестов/35 assertions PASS, включая
`models test` из профильного config без host/bundle и без inference.


TUI lifecycle foundation (этап 4, TUI ещё не подключён к standalone dispatcher):

- [x] Worker RPC возвращает ограниченную ошибку вместо вечного pending при throw;
  client.close отклоняет текущие и будущие запросы, transport send failure не оставляет pending.
- [x] Worker shutdown закрывает instances, listener, загруженный HttpApiApp scope
  и AppRuntime. TUI handler включает ранние ошибки validateSession в cleanup.
- [x] Standalone-вариант handler не скрывает shutdown timeout/error и возвращается
  внешнему owner вместо process.exit; legacy entry сохраняет прежний final exit.
- [ ] Private Loginom bridge между главным процессом и worker, disconnect propagation,
  worker crash и интерактивная acceptance остаются впереди.

Проверка RPC использует настоящий Bun Worker, без mock globalThis. 1 тест/4 assertions
PASS; Agent typecheck PASS. Это foundation, не доказательство работающего standalone TUI.

RPC + TUI thread regression: 11 тестов/22 assertions PASS; `git diff --check` PASS.


TUI private bridge подключён в исходниках (этап 4):

- [x] Default invocation направлен в существующий TuiThreadCommand после Loginom
  preflight; worker наследует CLI profile environment. Сетевые port/hostname/mdns/cors
  режимы и mini отклоняются standalone dispatcher.
- [x] Worker подключает LoginomHost adapter через отдельные RPC request/reply frames;
  host disconnect передаётся явно и закрывает pending/future requests, без зависимости
  от Bun MessagePort.close.
- [x] Завершение TUI возвращается внешнему owner для host/backend cleanup. Ошибка
  worker shutdown преобразуется в LOGINOM_TUI_CLEANUP_FAILED и не освобождает guard.
- [ ] Настоящий PTY/TUI запуск, prompt с Loginom tools, выход, resume и worker crash
  ещё требуют проверки. Текущая dispatcher wiring не объявляется TUI acceptance.

Проверки: реальный Bun Worker с protocol harness подтверждает request/reply и explicit
close; RPC + существующий TUI thread regression — 12 тестов/25 assertions PASS.

Регрессия standalone entry/management/run/model commands после TUI wiring:
7 тестов/94 assertions PASS; Agent typecheck и `git diff --check` PASS.


Исходная Linux PTY-приёмка TUI startup/exit:

- [x] Реальный standalone entry запускает TUI и worker с чистым CLI-профилем,
  отдельным Node host и управляемым runtime fixture. Без model auth показан
  диалог Connect a provider; Escape закрывает его, Ctrl+D завершает приложение.
- [x] Подтверждены exit 0, отсутствие forced termination, снятый guard и отсутствие
  живых PID всех fixture runtime и Node host. Успешный ручной запуск повторён.
- [x] Воспроизводимый harness сохранён в `packages/agent/test/cli/tui/standalone-pty.py`;
  требует Linux, Python3 PTY и существующий закреплённый Node в Desktop resources.
- [ ] Prompt/tool invocation из настоящего TUI, resume, worker crash, установленный
  артефакт и Chromium по-прежнему не подтверждены этим startup/exit тестом.

Проверенный source run: `/tmp/loginom-cli-tui-iy_8_zts`, exit 0,
forced=false, guard=false, alive=[], provider_dialog=true. Raw terminal output
остаётся только во временном каталоге, не добавлен в git. Первые два прогона
не закрывали открытый provider modal и требовали принудительной остановки;
они не учитываются как PASS. Подтверждение относится к Escape → Ctrl+D.
Python compile check и `git diff --check` PASS.


TUI prompt/tool source acceptance (этапы 3–4):

- [x] PTY harness получил режим `--prompt` с локальным OpenAI-compatible HTTP-provider.
  TUI читает модель из CLI config, допускает prompt через настоящий worker/backend,
  публикует `loginom_probe` в model tools и передаёт вызов настоящему private Node host.
- [x] Управляемый runtime fixture записывает факт вызова; tool result возвращается
  provider, который выполняет continuation. Сохранённая SQLite history проверена:
  completed `loginom_probe` с ожидаемым output и финальный assistant text.
- [x] В тесте задана policy `loginom_*: ask`; разрешение передаётся явным dangerous
  flag. Штатный TUI exit даёт 0, guard снят, PID host/runtime отсутствуют.
- [ ] Реальный Loginom/Chromium, TUI resume и installed artifact acceptance остаются открытыми.

Первый успешный source prompt run: `/tmp/loginom-cli-tui-yf9ac6k1`;
provider tool_advertised/tool_result/finished и runtime tool_called — true.
Read-only SQLite inspection подтверждает completed tool и финальный текст.
Raw terminal/model fixture данные не добавлялись в git.

Повтор с обязательной history assertion: `/tmp/loginom-cli-tui-ds85df1o`,
exit 0, forced=false, guard=false, alive=[], history_verified=true.
`git diff --check` PASS.


### Этап 5 — первый native CLI/TUI binary (полный архив ещё не готов)

- [x] `packages/agent/script/build.ts --standalone` собирает отдельный ранний entry
  и TUI worker, использует Product.cliExecutable и `dist-standalone`, не удаляя
  legacy/desktop dist. Web UI в CLI не включается; model snapshot берётся из pins.
- [x] Standalone build не вызывает legacy GitHub release upload и не выдаёт bare binary
  за законченный архив с Loginom runtime.
- [x] Linux x64 build с Bun 1.3.14: version `0.0.0-dev-202609171623`, размер
  145758336 bytes, SHA256 `0a6029c3c299dfeeca9605a2fcd5da7fc5f18c11f78a352b34bb66779e888fe4`.
- [x] Native help/version в пустом cwd не создают профиль или XDG каталоги.
- [x] Native PTY prompt/tool acceptance с тем же управляемым Node runtime fixture:
  setup, TUI worker, Loginom tool, continuation, SQLite history и cleanup PASS.
- [ ] Общий resource staging, manifest verification, standalone archive/install/uninstall,
  реальный Loginom oracle и установленный Desktop regression остаются впереди.

Артефакт: `packages/agent/dist-standalone/loginom-ai-agent-cli-linux-x64/bin/loginom-ai-agent-cli`.
Проверенный PTY run: `/tmp/loginom-cli-tui-h_6ekps9`, exit0, guard=false, alive=[],
history_verified=true. Harness принимает абсолютный LOGINOM_AI_AGENT_TEST_CLI_EXE;
без него сохраняет source mode. Это native binary с fixture bundle, не installed archive.

После build wiring: Agent `bun typecheck` и `git diff --check` PASS.


Общий resource staging (этап 5):

- [x] Desktop bundler заменён wrapper над `packages/loginom-host/script/stage-resources.ts`.
  Helper принимает output, node/browser inputs, target и flavor. Desktop/CLI используют
  одну реализацию проверки pins, runtime dependency install и resource hashes.
- [x] Неподдержанные native targets, относительные пути и output, перекрывающий inputs,
  отклоняются. Windows/macOS пока не получают Linux pins по умолчанию.
- [x] Реальный Linux staging в CLI resources: 4365 файлов; Node 24.19.0,
  Chromium revision 1243; каждый hash перечитан и подтверждён после сборки.
- [x] Node host dependency closure собрана рядом; native binary с этим payload выполняет
  `loginom status --format json` (unconfigured, exit0, guard снят).
- [ ] Полный CLI artifact manifest, включающий host/native binary, установщик,
  notices/license audit, browser launch и живой Loginom oracle ещё впереди.

Проверенный payload: `packages/agent/dist-standalone/loginom-ai-agent-cli-linux-x64/resources/loginom`.
Status profile: `/tmp/loginom-cli-native-resources-a0diojnl/profile`.
Ресурсы установленного Desktop не изменялись. Host stage-resources test: 1/3 PASS;
Host/Desktop typecheck и `git diff --check` PASS. Build-time npm ci выполнен в staging;
runtime/install ничего не скачивали. Сам status не запускает Chromium.

Desktop packaging regression: 5 тестов/47 assertions PASS после extraction.


CLI manifest foundation (этап 5):

- [x] Общий `cli-manifest.ts` описывает version/channel/target, source commit,
  source-tree SHA256 и dirty state, версии зависимостей и полный payload inventory.
  Записи содержат SHA256, mode и symlink target; hashes читаются потоково.
- [x] Verifier отвергает изменённые/лишние/пропущенные payload files, дубликаты путей,
  несовпадение target/version, path traversal и symlink escape; обязательны native
  executable, Node host entry, Node executable и resource-manifest.
- [x] Installed resolver в исходниках ищет artifact root относительно process.execPath,
  проверяет manifest и выбирает resources/loginom. Явный CLI_BUNDLE сохраняет
  development fixture режим.
- [ ] Build orchestration должна сформировать manifest с настоящим source snapshot
  после пересборки native binary. Старый binary не получает новый manifest с ложной
  source identity. Native auto-discovery/installer acceptance ещё не выполнены.

Проверки fixture manifest: 1 тест/6 assertions PASS, включая внутреннюю symlink;
Host/Agent typecheck и `git diff --check` PASS. Это проверка integrity contract,
не доказательство готовности установленного дистрибутива или release provenance.

Entry/model-management regression после resolver wiring: 5 тестов/35 assertions PASS.


Build orchestration + native auto-discovery (этап 5):

- [x] `packages/loginom-host/script/build-cli.ts <new-absolute-output>` собирает
  native binary, shared resources, Node host closure, затем CLI manifest и проверяет
  полный payload. Существующий output не перезаписывается.
- [x] Native build принимает новый абсолютный output для orchestrator, сохраняя
  прежние кандидаты. Source snapshot hash включает tracked/untracked build inputs;
  проверка до/после сборки отклоняет изменившееся дерево. Manifest записывает dirty state.
- [x] Новый Linux кандидат выполняет status без CLI_BUNDLE, включая symlink launcher.
  Extra payload file вызывает ограниченный отказ до host launch; guard освобождается.
- [ ] Installer/uninstaller, архив и release provenance из clean committed source
  остаются незавершёнными. Этот кандидат — development artifact, не release.

Кандидат `/tmp/loginom-cli-candidate-20260917-manifest`, version
`0.0.0-dev-202609171632`, base commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`,
sourceTreeSha256 `23c74711ce2ff5dffcefcdee85fac634d8344e7c59718adc7d86e7e2c77c3e83`,
sourceDirty=true. Проверенный auto-discovery profile:
`/tmp/cli-native-discovery-3wb__f52/profile`. Agent typecheck и diff check PASS.
Документация после сборки может измениться; manifest относится к зафиксированному
hash в момент сборки, а не к последующему working tree.


Linux installer/uninstaller (этап 5):

- [x] В payload включены install.sh/uninstall.sh и bundled Node installer closure.
  Перед установкой и после копирования проверяется manifest; versioned payload
  расположен в ~/.local/share/loginom-ai-agent-cli, launcher — ~/.local/bin.
- [x] Чужой/существующий launcher не перезаписывается; установка сериализована
  отдельным lock. Для update требуется остановка процессов, uninstall, затем install.
- [x] Uninstall проверяет receipt/launcher/manifest, отклоняет активные executable PID
  внутри payload и удаляет только текущую установку. Profiles/Desktop не удаляются.
- [x] Реальная установка native candidate в временный home → status без bundle override
  → запуск uninstall из installed payload → сохранение profile sentinel PASS.
- [ ] Windows/macOS installers, live Loginom oracle, license audit и clean release
  остаются незавершёнными. Непроверенные IND gates не повышаются до PASS.

Кандидат `/tmp/loginom-cli-candidate-20260917-install`, version
`0.0.0-dev-202609171636`, sourceTreeSha256
`8682f32e549d9fa5797204549a4201a0fdf20fb55a5c7c11b7b15e88a43413dd`, sourceDirty=true.
Installed acceptance home `/tmp/cli-install-acceptance-pejyfejc`; profile
`.config/com.loginom.aiagent.dev/cli/profiles/default` сохранён после uninstall.
Installer+manifest: 2 теста/14 assertions PASS; Host typecheck и diff check PASS.


- [x] Development Linux tar.gz создан и распакован; native status из распакованного
  payload без CLI_BUNDLE проходит полный manifest check и завершается с 0.
Архив `/tmp/loginom-ai-agent-cli-0.0.0-dev-202609171636-linux-x64.tar.gz`,
286129693 bytes, SHA256 `83ed921cab5b9264bed154a76600bbf43053d65aae686477b6b69f7aedda4c28`.
Extracted acceptance `/tmp/cli-archive-acceptance-51oag6j6`. Архив создан локально,
не опубликован и не объявляется релизом. Автоматизация archive step в orchestrator
ещё не подключена (использован tar после проверки candidate).


Подтверждение завершения runtime (этапы 2/4):

- [x] Supervisor требует одновременно ответ `closed: true` и завершение дочернего
  процесса с кодом 0 без сигнала. Потеря ответа, ненулевой код и timeout с SIGKILL
  возвращают `LOGINOM_RUNTIME_CLEANUP_FAILED`; повторный close сохраняет тот же результат.
- [x] Managed runtime отклоняет новые операции после начала закрытия, прерывает
  активный вызов, дожидается принятых запросов и последовательно закрывает ресурсы.
  Подтверждение отправляется после cleanup; ошибки закрытия больше не подавляются.
- [x] Host: 16 тестов/78 assertions и typecheck PASS. Включены реальные pinned Node
  процессы без acknowledgement, с exit 1 и с зависанием после acknowledgement.
- [x] CLI process regression: 2 теста/59 assertions PASS. Desktop connection/host-port/
  recovery regression: 25 тестов/74 assertions и Desktop typecheck PASS.
- [x] Исходный managed-entry под pinned Node: close до start и close одновременно
  с ошибкой start завершаются с acknowledgement, exit 0, без сигнала. Syntax check PASS.
- [ ] Завершение настоящего Chromium, owner loss во время внешнего эффекта и
  проверка обновлённого установленного артефакта остаются незавершёнными.
  Архив `0.0.0-dev-202609171636` построен до этих изменений и их не подтверждает.


Прямой отказ permission без события asked (этап 4):

- [x] Общий tool context сохраняет `permissionDenied: true` в metadata перед
  сериализацией Permission Denied/Rejected ошибки. Standalone run распознаёт этот
  признак, выдаёт `CLI_PERMISSION_REJECTED` и возвращает 1. Legacy exit policy
  этим условием не меняется.
- [x] Реальный source process с fixture provider: доступный bash, policy deny для
  конкретной команды pwd, dangerous flag включён. Вызов отклонён без asked,
  сохранена error part с metadata, итоговый exit 1, guard освобождён.
- [x] Очередь fixture provider сбрасывается между policy-deny и cancellation
  сценариями: оставшийся после остановки текст больше не подменяет следующий вызов.
- [x] Standalone: 2 теста/64 assertions PASS; legacy run: 13/47 PASS; processor:
  17/80 PASS. Agent typecheck, formatting и diff check PASS.
- [ ] Полностью скрытый политикой инструмент обрабатывается как `invalid`;
  неустранённый invalid, MCP isError и исправленные ошибки инструментов ещё требуют
  общей итоговой проверки. Этот шаг не закрывает весь контракт exit codes.


MCP isError в общем Loginom tool path (этап 4):

- [x] Loginom MCP result с isError=true теперь становится ошибкой инструмента,
  как в обычном MCP catalog. Текст сохраняется в error part; metadata содержит
  isError и generation. Пустой текст получает ограниченный LOGINOM_TOOL_FAILED.
- [x] Source process через настоящий приватный Node host и fixture runtime/provider
  сохраняет status:error вместо completed. После следующего успешного вызова
  в том же prompt история содержит обе части: error, completed; exit 0, guard снят.
- [x] Standalone process suite: 2 теста/71 assertions PASS; Agent typecheck PASS;
  diff check PASS. Runtime fixture не запускает Chromium и не доказывает live oracle.
- [ ] Итоговый ненулевой exit при неустранённой tool error/invalid ещё не реализован.
  Новый тест отдельной ошибки проверяет только её представление в events, а не exit.
  Требуется определить подтверждённую связь ошибки с исправлением; успех другого
  инструмента нельзя считать автоматическим исправлением. Этап 4 остаётся открыт.


Автоматический Linux archive (этап 5):

- [x] build-cli.ts создаёт versioned tar.gz и отдельный .sha256 рядом с payload.
  Tar нормализует порядок, mtime, owner/group; checksum вычисляется потоково.
- [x] До публикации архив распаковывается во временный каталог, где проверяется
  полный CLI manifest. Archive/checksum публикуются эксклюзивными hard links;
  существующие файлы не заменяются. При ошибке публикации собственные links удаляются.
- [x] Новый native candidate собран, извлечён, установлен в временный home; native
  status без bundle override завершился с 0. Uninstall удалил launcher/payload
  и сохранил профиль. PATH содержал только dirname: глобальные Node/Bun/Chrome
  для этой management-проверки недоступны. TUI/run этим тестом не проверяются.
- [x] Host typecheck теперь включает script/ вместе с src/ и test/; PASS.
- [ ] Это dirty development candidate. Live Loginom/Chromium, системные библиотеки,
  license audit, clean release и native Windows/macOS остаются незавершёнными.

Artifact `/tmp/loginom-cli-candidate-20260917-autoarchive`; version
`0.0.0-dev-202609171656`; base commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`;
sourceTreeSha256 `3f2325b2fd1669661f27b3d5ed501b1312c1e47d343a5c1789609c573213912b`.
Archive `/tmp/loginom-ai-agent-cli-0.0.0-dev-202609171656-linux-x64.tar.gz`,
285859245 bytes, SHA256 `e70ae7ab5e8720ab622c85dce778fce1637adabe95411e7659b81b52218555d3`.
Acceptance `/tmp/cli-autoarchive-acceptance-fix5ysin/result.json`. Последующие
изменения документации и tsconfig не входят в source snapshot этого кандидата.


Первый запуск TUI без Loginom (этапы 3/4):

- [x] Обязательные hasApiKey/ready preflight проверки ограничены командой run.
  TUI без ключа предлагает настройку в терминале; по умолчанию можно отказаться
  и открыть обычный чат. При выборе настройки используется тот же private host
  и loginomManagement; отмена возвращает 130. Recovery-проверка сохраняется.
- [x] После startup prompts stdin возобновляется перед передачей TUI: readline
  закрывает prompt с приостановкой потока.
- [x] Source PTY unconfigured + fixture provider: setup пропущен, обычный ответ
  сохранён в SQLite, Loginom tools не advertised/called, runtime не запущен,
  exit 0 и guard снят (`/tmp/loginom-cli-tui-7gkkq2zw`).
- [x] Source PTY unconfigured без provider: предложение setup, provider dialog,
  штатный выход 0, guard снят (`/tmp/loginom-cli-tui-c0lnemp9`). Harness теперь
  ждёт появления экрана перед Escape/Ctrl+D; ранние попытки по фиксированному
  таймеру завершались принудительно и не считаются PASS.
- [x] Настроенный source TUI prompt/tool/history regression PASS
  (`/tmp/loginom-cli-tui-i3mtntr1`). CLI process tests: 2/71 PASS, Agent typecheck PASS.
- [ ] Полный интерактивный ввод setup, ошибочные credentials, live Loginom и
  повторная native artifact приёмка этого изменения ещё не подтверждены.
  Архив 0.0.0-dev-202609171656 предшествует этому изменению.


Интерактивный TUI setup (этап 3):

- [x] PTY harness умеет --setup: выбирает настройку на старте, вводит API-ключ,
  принимает URL/username и пустой пароль. Private runtime fixture проверяет
  реальные переданные значения перед handshake. Далее tool call, continuation,
  history, exit 0, снятый guard и отсутствие записанных PID host/runtime PASS.
  Source acceptance: `/tmp/loginom-cli-tui-a5o9tq1s`.
- [x] --setup --password --prompt выбирает ввод нового пароля. Оба fixture secrets
  отсутствуют в terminal output, runtime подтвердил правильный непустой пароль.
  Tool/history/cleanup PASS: `/tmp/loginom-cli-tui-ngq84xtf`.
- [x] --cancel-setup посылает Ctrl+C на поле API-ключа: exit 130, guard снят,
  runtime/tool не запущены, forced=false (`/tmp/loginom-cli-tui-j_6tj84i`).
- [ ] Проверки использовали source entry и fixture runtime/provider. Они не
  подтверждают authentication живого Loginom, wrong-credential diagnostics,
  OS credential protection либо native archive этого UI. Эти пункты остаются открытыми.


Настоящий Chromium и startup-error cleanup (этапы 2/5):

- [x] Добавлен script/browser-acceptance.ts: bundled Node + managed runtime +
  pinned настоящий Chromium, локальные MCP initialize и authenticated-page fixtures.
  Отслеживаются PID по уникальному user-data-dir, renderer seccomp=2, отсутствие
  --no-sandbox и отсутствие наблюдавшихся PID после завершения.
- [x] Реальная проверка выявила race: runtime после startup error выходил до
  получения close, маскируя ACCOUNT_MISMATCH как CLEANUP_FAILED. Теперь resources
  закрываются сразу, IPC остаётся до acknowledged close. Cleanup rejection
  сохраняется memoized и не превращается в успешный ответ.
- [x] На новом payload successful validation и wrong identity: по 10 browser PID,
  sandbox=true, alive=[]; ошибка сохраняется как LOGINOM_ACCOUNT_MISMATCH.
- [x] Native CLI setup rejection с копией real resource bundle и локальным
  manifest endpoint: LOGINOM_ACCOUNT_MISMATCH, exit 1, guard=false, sandbox=true,
  alive=[]. Это явный development bundle override, не installed auto-discovery
  приёмка живого Loginom. Оригинальный artifact не менялся.
- [x] Host tests: 16/78 PASS, typecheck со script/ PASS. Исходный runtime также
  подтвердил acknowledged close после error и 100 ms задержки owner запроса.
- [x] Новый native binary прошёл PTY --setup --password --prompt: оба секрета
  скрыты, tool/continuation/history PASS, exit 0, guard=false, alive=[]
  (`/tmp/loginom-cli-tui-_zhlal_b`). В этом TUI тесте runtime/provider — fixtures.
- [ ] Не проверены owner loss во время настоящего внешнего эффекта, startup
  cancellation, длительный managed browser session и live Loginom CSV/save/reopen.
  Sandbox результат относится только к текущей Linux-системе и этому artifact.

Кандидат `/tmp/loginom-cli-candidate-20260917-browser-cleanup`, version
`0.0.0-dev-202609171710`, sourceTreeSha256
`8e8291e7ce98cda932948bc1d3667914f0c429fa6279276be0385fef13c24cf2`, sourceDirty=true.
Archive `/tmp/loginom-ai-agent-cli-0.0.0-dev-202609171710-linux-x64.tar.gz`,
285865304 bytes, SHA256 `7c9217b6997ea99ea675f9cb329207f293fba18340a540fd164e16a252da9256`.
Последующие изменения acceptance script/документации не входят в snapshot сборки.


Живой Loginom на ресурсе CLI candidate (этапы 2/3/5):

- [x] Runtime oracle A/B на ресурсе 0.0.0-dev-202609171710: два sales.csv,
  точные суммы 55/101, сохранение и независимое холодное открытие обоих пакетов
  без перенастройки узлов; разные source paths. Private summary PASS:
  `/tmp/loginom-linux-oracle-Tv9CKS/summary.json`.
- [x] Parent SIGKILL после readiness: 12 отслеживаемых процессов, живых потомков 0.
  parent-crash.ts принимает явный resource override и проверяет passwordless config.
- [x] Desktop typecheck и diff check PASS. Установленный Desktop не изменялся.
- [ ] Эти проверки вызывают managed runtime напрямую. Не закрыты одинаковый prompt
  через Desktop/TUI/run, точный CSV amount из минимального oracle и crash во время
  изменяющей операции. IND-03/05/10 не повышены до полного PASS.

Подробный scope и provenance: [runtime report](../../testing/loginom-ai-agent/reports/2026-09-17-cli-runtime/report.md).


Итоговые tool errors в source run (этап 4):

- [x] Standalone run отслеживает terminal tool parts до idle. Неустранённый
  status:error, metadata.isError либо invalid дают JSON CLI_TOOL_FAILED и exit 1.
  Итоговый текст модели сам по себе ошибку не снимает. Legacy exit policy сохранена.
- [x] Для Loginom ошибка закрывается успешным вызовом того же инструмента с тем же
  operation_id. Без operation_id нужен успешный вызов с точными аргументами
  (порядок ключей объектов несущественен; порядок массивов существенен).
  Успех другого инструмента/operation_id не снимает прежнюю ошибку.
- [x] Process suite: 2 теста/82 assertions PASS. Проверены одиночный MCP isError,
  исправленный Loginom operation_id, несвязанный успешный вызов и policy-hidden
  tool, который превратился в invalid. Во всех завершениях guard освобождён.
- [x] Outcome tests: 4/9 PASS; legacy run regression: 13/47 PASS; Agent typecheck
  и diff check PASS. Permission/session errors сохраняют свою отдельную семантику.
- [ ] Для универсального инструмента исправление через изменённые аргументы
  без известной operation identity пока консервативно остаётся ошибкой. Invalid
  также не снимается поздним успехом без связи с исходным вызовом. Необходимо
  довести явную связь исправления; весь контракт исправленных ошибок ещё открыт.
  Native artifact 0.0.0-dev-202609171710 предшествует этому изменению.


Native CLI и реальные вложения (этапы 2/4/5, промежуточная проверка):

- [x] Добавлен ручной `script/cli-oracle-transport.ts`: локальный scripted provider
  проводит существующий runtime oracle через настоящий `loginom setup` и `run`.
  Используются отдельный профиль и исходное пользовательское `--file`; этот
  адаптер не является проверкой качества production-модели.
- [x] Исправлен Linux startup Chromium при длинном пути профиля: короткий private
  alias TMPDIR указывает на канонический profile cache/tmp. Причина воспроизведена
  реальным Chromium: SingletonSocket превышал ограничение Unix socket path.
  Alias удаляется после успешного cleanup до снятия guard; при ошибке cleanup
  сохраняется вместе с guard. Source profile/standalone tests: 9/49 PASS.
- [x] Standalone `run --file` сохраняет snapshot байтов в исходном сообщении,
  включая MIME и существующие ограничения размера/типа файла. Private admission
  получает data URL вместо недоступного file URL. Process suite: 2/84 PASS,
  проверены сохранённые байты `amount\n10\n20\n25\n`; legacy run: 13/47 PASS;
  Agent typecheck PASS. Аналогичный полный путь вложений TUI ещё не подтверждён.
- [x] Собран и проверен Linux candidate 0.0.0-dev-202609171741:
  `/tmp/loginom-cli-candidate-20260917-attachments`, sourceDirty=true,
  sourceTreeSha256 `0b98aaf40b7be5463b18152dd42f9fe711db14f7c4c281f801a46478984b0863`.
  Archive SHA256 `bb2f4500249cb989828b58c90abdadd8e0ae84a7d9783c9efe0f3c33de528110`.
  Последующие изменения test adapter/документации не входят в этот snapshot.
- [x] Живой CLI run на этом candidate: setup ready; dock_prepare получил ровно
  одно исходное вложение; dock_artifact_deliver подтвердил 42 bytes и SHA256
  `98aa522befcb544089edf626c2713e1cf69aaf54f93a0a92a0df7e3e4a10fcd5`.
  Private evidence: `/tmp/loginom-linux-oracle-idY1ka`, три tool receipts.
- [ ] Полный CLI oracle НЕ пройден. dock_node_apply(import-A) вернул `running`,
  затем host-port заблокировал следующий вызов как LOGINOM_RECOVERY_REQUIRED.
  Runtime `hasUnsettledWork()` сейчас смешивает штатную асинхронную операцию
  с неопределённостью, а общий journal запрещает последующее ожидание. Нужны
  отдельные состояния активной работы и неопределённости, регрессионные тесты
  и новый независимый прогон после исправления. Текущая операция не повторялась;
  результат импорта не объявлен проверенным. Guard после выхода отсутствует.
- [x] Acceptance adapter сохраняет отдельный exit receipt и различает ненулевой
  exit приложения от оставшегося guard; прежде CLI_ORACLE_SHUTDOWN_FAILED
  ошибочно маскировал основной код ошибки даже при снятом guard. Host typecheck PASS.

Установленный Desktop не изменялся. Все IND gates, требующие полного run/TUI/
Desktop oracle, остаются открытыми; локальные кандидаты не опубликованы.


Ожидание асинхронных операций (этапы 2/4/5):

- [x] Runtime сообщает отдельный private `activeWork`: выполняющийся executor,
  node job или delivery. Незавершённость сама по себе больше не означает потерю
  управления. Clipboard uncertainty не выдаётся за штатную активную работу.
- [x] Общий host сохраняет durable journal записей текущего владельца через
  повторные wait; снимает их только после ответа этого runtime без unsettled work.
  Повторный acquire того же chat запрещён до release. Release/close владельца,
  разрыв IPC и неактивная неопределённость переводят удержанные записи в recovery;
  успех другого run не снимает их. Повторный close сохраняет одно завершение.
- [x] Новый процессный regression test: 5 сценариев/58 assertions PASS. Проверены
  durable records при wait и их обнаружение после повторного открытия store,
  нормальное завершение, release, close, неопределённый ответ и disconnect.
  Полный host suite 21/136 PASS; host typecheck PASS. Executor/bridge suite
  51 tests PASS, включая running и AMBIGUOUS на executor с тестовой страницей.
- [ ] Новый native artifact и живой полный CLI oracle после этого изменения
  ещё требуют проверки. Предыдущий import-A не повторяется и не считается успешным.


Живой native CLI oracle после исправления async wait (этапы 3/4/5):

- [x] Candidate `0.0.0-dev-202609171753` собран с проверкой extracted manifest;
  artifact `/tmp/loginom-cli-candidate-20260917-async-wait`, sourceDirty=true,
  sourceTreeSha256 `3c0255cc355b2f299dd7f011129956da3587bda6ca3b3c0760bdb9b9507215dd`.
  Archive SHA256 `b1cf1d86d4798aa0beffd9ba69eb5cbe7bee8177e53125e88391cba6f3db3e83`.
- [x] Настоящий CLI `run --headless --format json --file` через scripted provider
  и живой Loginom: два sales.csv в отдельных профилях, amount 10/20/25 и 100/1,
  импорт, группировка, сохранение, закрытие. Independent cold readback PASS:
  суммы 55/101, settingsReapplied=false; source paths различаются.
  Оба CLI exit=0, guard=false. Evidence `/tmp/loginom-linux-oracle-KnLoLK/summary.json`.
  Предыдущий неопределённый import-A из иного прогона не повторялся.
- [x] Native TUI PTY setup/password/prompt на этом candidate PASS: exit=0,
  guard=false, alive=[], secret_visible=false, history_verified=true.
  Здесь использован fixture runtime, а не живой Loginom; evidence
  `/tmp/loginom-cli-tui-n1cy818x`. Agent/Desktop typecheck и diff check PASS.
- [ ] Полные IND-03/04/05/10/14 остаются открытыми: нет одинакового
  prompt и настроек через Desktop/TUI/run, всей headed/resume/crash matrix и установленного
  Desktop regression. Этот run вызвал binary из artifact, а не из установки.

Scope и provenance: [CLI run report](../../testing/loginom-ai-agent/reports/2026-09-17-cli-run/report.md).


Вложение CSV через TUI (этапы 3/4):

- [x] Standalone SessionPrompt сохраняет full-file текстовое вложение пользователя
  как data URL перед private admission. Файлы с URL query/range или fragment
  остаются ссылками: выбор строк не разрешает передачу всего файла. Legacy
  поведение вне standalone сохранено; model tool paths не получают admission.
- [x] Общий `util/file-snapshot.ts` используется также `run --file`: максимум
  10 MiB, проверка regular file, ограниченные чтения, обнаружение изменения
  size/mtime; FIFO открывается nonblocking и отклоняется без ожидания writer.
  Byte boundary test 1/7 PASS (пустой, UTF-8, binary, oversized, directory, FIFO).
- [x] SessionPrompt regression 1/4 PASS: точный snapshot исходного CSV в истории
  и отсутствие whole-file snapshot для ссылки на строку. Agent typecheck PASS.
  Legacy run process 13/47 PASS; standalone process 2/84 PASS.
- [x] Source TUI PTY: выбор `@sales.csv`, отправка prompt, tool call, точные байты
  `amount\n10\n20\n25\n` в private input store и data URL в истории; exit=0,
  guard=false, alive=[]. Evidence `/tmp/loginom-cli-tui-a51ukkek`.
  Первый PTY attempt вводил текст до готовности экрана и завершился по timeout;
  после него отслеживаемых PID нет. Driver теперь ждёт видимое поле ввода.
- [ ] Native candidate с этим изменением и живой TUI CSV oracle ещё не проверены.
  PTY использовал fixture provider/runtime и не закрывает полный IND-03.

Native подтверждение вложения TUI:

- [x] Candidate `0.0.0-dev-202609171808`, artifact
  `/tmp/loginom-cli-candidate-20260917-tui-files`, sourceDirty=true,
  sourceTreeSha256 `e88186d6093fa0033bbacfa986ff23ef561d2507279effa894da94bce115460e`.
  Extracted manifest проверен. Archive SHA256
  `756a7917c67343acdfa5206390357ce22d1e9c9f1ce616bd4b0ca8f6ccdbe1aa`.
- [x] PTY `--prompt --attachment` на native executable PASS: выбор CSV через
  autocomplete, exact-byte private admission, snapshot в истории, tool call,
  exit=0, guard=false, alive=[], forced=false. Private evidence
  `/tmp/loginom-cli-tui-_jh_b7xn`. Использован fixture runtime/provider, не живой
  Loginom; полный одинаковый Desktop/TUI/run oracle остаётся открытым.


Согласованность контекста и начало живого TUI oracle (этапы 3/4):

- [x] В source standalone SessionPrompt текст модели и data URL полного
  текстового вложения теперь производятся из одного file snapshot. Отдельный
  предварительный Read больше не определяет текст модели для этого случая.
  Регрессии snapshot/range, отмены file/directory read и отсутствующего файла:
  4 tests/8 assertions PASS. Agent, Host, Desktop typecheck PASS.
  Изменение контекста сделано после candidate 0.0.0-dev-202609171808 и пока не
  подтверждено отдельной native пересборкой.
- [x] Manual oracle adapter поддерживает `LOGINOM_AI_AGENT_TEST_CLI_INTERFACE=tui`.
  PTY driver выбирает исходный sales.csv через autocomplete и передаёт тот же
  текст задания; scripted provider использует тот же backend tool path.
  Завершение TUI ожидается после ответа provider; exit/forced сохраняются отдельно.
- [ ] Живой TUI oracle на candidate 0.0.0-dev-202609171808 запущен в новых профилях;
  полный результат ещё ожидается. Операции прежних неопределённых прогонов не
  повторяются. Эта проверка не является оценкой production-модели.


Живой TUI oracle завершён (этапы 3/4/5):

- [x] Native TUI 0.0.0-dev-202609171808: два CSV выбраны через autocomplete,
  SHA256 исходного пользовательского файла проверен runtime, выполнены импорт,
  группировка, сохранение и закрытие пакетов. Private admission не подменялся.
- [x] Оба independent cold readback PASS: total=55/101, settingsReapplied=false,
  source paths различаются. Native TUI exit=0, forced=false, guard=false в обоих
  профилях. Evidence `/tmp/loginom-linux-oracle-AzjH3J/summary.json`, 32 tool receipts.
- [ ] Полные IND-02/03/04/10/14 остаются открытыми: Desktop не сравнивался на
  том же source build, headed/resume/crash matrix не закрыта. Provider scripted,
  permission bypass задан явно. Последний source fix snapshot-контекста не входит
  в tested candidate 0.0.0-dev-202609171808 и требует будущей native пересборки.

Подробный scope/provenance: [TUI report](../../testing/loginom-ai-agent/reports/2026-09-17-cli-tui/report.md).


Возобновление TUI и режим нового запуска (этап 4):

- [x] Native candidate 0.0.0-dev-202609171808: run создаёт сессию с headless=true,
  затем TUI `--session <id> --no-headless` открывает её и выполняет новый tool call.
  Сохраняются единственный Session ID, прежняя история и оба completed tool parts;
  новый chat runtime получает headless=false. Evidence `/tmp/loginom-cli-tui-e7es86z4`.
- [x] Та же проверка через `--continue --no-headless` PASS; evidence
  `/tmp/loginom-cli-tui-dgad2a02`. В обоих случаях exit=0, forced=false, guard=false,
  alive=[], resume_verified=true, mode_changed=true.
- [x] PTY fixture теперь записывает private start envelopes для различения
  readiness/validation и chat runtime. Первоначальная проверка ошибочно включала
  validation runtime в список runtime чата; фильтр исправлен по chat identity,
  оба сценария повторно прошли на новых изолированных профилях.
- [ ] Использован fixture runtime/provider, без настоящего окна Chromium.
  Эти проверки подтверждают session/history reuse и передачу launch mode, но не
  закрывают фактическую headed visibility, живой Loginom resume или IND-04 целиком.


Неверный Session ID при запуске TUI (этап 4):

- [x] Ошибка синтаксиса ID выделена в InvalidSessionError. Standalone TUI
  сообщает ограниченный CLI_ARGUMENT_INVALID и exit 2 вместо прежнего exit 1.
  Ошибки API после корректной валидации ID не маскируются как ошибки аргументов;
  legacy CLI сохраняет прежний текст диагностики и exit policy.
- [x] Source process PTY `--invalid-session`: code=2, forced=false, guard=false,
  alive=[], tool_called=false; evidence `/tmp/loginom-cli-tui-uxvmbej7`.
- [x] Validator test с настоящим локальным HTTP server: 1 test/5 assertions PASS.
  Неверный ID не вызывает API; 404 для корректного ID не становится
  InvalidSessionError. Agent typecheck и diff check PASS.
- [ ] Это source изменение; candidate 0.0.0-dev-202609171808 ему предшествует.
  Требуется включить его в следующую native сборку и проверить там exit contract.


Настоящие окна Chromium на Linux X11 (этапы 2/4/5):

- [x] `script/browser-acceptance.ts --headed` на ресурсах candidate
  0.0.0-dev-202609171808: найдено X11 окно с Map State=IsViewable и PID именно
  тестового Chromium. После закрытия runtime окно отсутствует, alive=[],
  sandbox=true, отслеживалось 10 browser processes. Log `/tmp/loginom-headed-browser.log`.
- [x] Headless с `--window-check`: ни одного mapped окна тестового Chromium,
  cleanup PASS, alive=[], sandbox=true, 10 browser processes.
  Log `/tmp/loginom-headless-window.log`.
- [x] Headed с ошибкой identity: окно появилось и затем закрылось; итоговый
  LOGINOM_ACCOUNT_MISMATCH не заменён ошибкой cleanup; alive=[], sandbox=true.
  Log `/tmp/loginom-headed-rejection.log`. Headless и rejection проверки
  выполнялись одновременно с разными профилями; окна сопоставлялись по PID.
- [x] Host typecheck и diff check PASS. Observer читает только свойства окон,
  не закрывает чужие окна и не меняет существующие приложения.
- [ ] Эти проверки вызывают настоящий managed runtime напрямую и используют
  локальную authentication-page fixture. Они не проверяют живой Loginom сценарий
  через headed TUI/run или resume с реальным браузером. IND-04 остаётся открытым
  до проверки этих пользовательских путей; результаты относятся к текущей X11 ОС.


Подготовка headed oracle пользовательских CLI путей (этапы 3/4/5):

- [x] Manual oracle принимает `LOGINOM_AI_AGENT_TEST_CLI_HEADED=1` для run/TUI.
  Режим передаётся через реальный CLI флаг, а не изменением browser fixture.
- [x] Добавлен пассивный X11 observer: сопоставляет окна с PID Chromium по
  отдельному каталогу профиля, фиксирует Map State=IsViewable и отсутствие окна
  после завершения. Проверка не закрывает и не изменяет чужие окна.
- [x] Host/Desktop typecheck и diff check PASS.
- [ ] Native сборка с последними source исправлениями и полный headed oracle
  ещё требуют выполнения; наличие observer само по себе не является PASS.


Живой headed run и новая native сборка (этапы 3/4/5):

- [x] Candidate 0.0.0-dev-202609171831 собран и проверен из dirty source snapshot
  `098baffe492401950c7a1553f9e156a5241c13d94a9741ac86956e87d1cc17f7`.
  Artifact `/tmp/loginom-cli-candidate-20260917-headed`; archive SHA256
  `2fdbe774dc78bdf268fb72a7d5021fc209b7251f8429bbd9fdc573b19dbbc5dd`.
- [x] Native invalid Session ID: exit 2, guard=false, alive=[]; native TUI CSV
  attachment/admission/history PASS. В SQLite synthetic model text совпал с CSV
  snapshot. Evidence `/tmp/loginom-cli-tui-vfwv5ijv`, `/tmp/loginom-cli-tui-i541x7rq`.
  Последние source fixes теперь вошли в проверенный native artifact.
- [x] Живой `run --no-headless`: оба CSV построены/выполнены/сохранены/закрыты;
  independent cold readback PASS, суммы 55/101, settingsReapplied=false,
  source paths различаются. X11 observer подтвердил mapped окно собственного
  Chromium в каждом профиле и отсутствие этих окон после выхода. Оба exit=0,
  guard=false. Evidence `/tmp/loginom-linux-oracle-BFpxrd/summary.json`.
- [x] Исправлен EOF в acceptance adapter: TUI сохраняет control stdin, run сразу
  закрывает его. Первый attempt до исправления не выполнял tools; новый прошёл
  на новых профилях. Host typecheck PASS.
- [ ] SIGINT при ожидании stdin до dispatch: отдельный остановленный attempt
  `/tmp/loginom-linux-oracle-2JX12e` дал 130 и оставил guard, хотя после остановки
  CLI/browser processes не осталось. Нужен управляемый early cancellation с
  подтверждённым cleanup до освобождения guard; это не закрывает IND-10.
- [ ] Headed TUI, живой resume, одинаковая Desktop/TUI/run сборка и остальные
  recovery/platform gates остаются открытыми. Установленный Desktop не изменялся.

Scope/provenance: [headed run report](../../testing/loginom-ai-agent/reports/2026-09-17-cli-headed-run/report.md).


Отмена run при открытом stdin (этап 4, source fix):

- [x] Standalone чтение prompt stdin допускает SIGINT без ожидания EOF. Отмена
  возвращает управление через обычный lifecycle: CLI_CANCELLED, exit 130,
  затем AppRuntime/host cleanup и освобождение guard. Legacy stdin policy сохранена.
- [x] Source process test намеренно держит пишущий конец pipe открытым до выхода
  дочернего CLI: exit=130, cancelled=true, guard=false, alive=[], tool_called=false.
  Evidence `/tmp/loginom-cli-tui-eyxr2yy1/result.json`.
- [x] Два subprocess boundary cases проверяют SIGINT и обычный EOF с UTF-8;
  listener удаляется в обоих случаях. stdin suite: 6 tests/16 assertions PASS.
  Legacy run process + прежние stdin tests: 17/55 PASS. Agent typecheck PASS.
- [ ] Исправление предшествует следующей native пересборке; candidate
  0.0.0-dev-202609171831 ещё содержит старое поведение. Отмена до входа в этот
  reader (например, во время host startup), повторные сигналы во время cleanup
  и отмена активной внешней операции остаются отдельными незакрытыми проверками.
  Весь IND-10 не объявляется пройденным.


Владелец SIGINT на протяжении bootstrap run (этап 4, source):

- [x] Bootstrap run держит обработчик SIGINT до завершения host cleanup и снятия
  profile guard. AbortSignal сохраняет отмену через startup/import boundaries;
  reader stdin и provider dispatch проверяют её перед новой работой. TUI и
  management signal policy этим изменением не подменяется.
- [x] При SIGINT во время запуска host команда дожидается результата запуска,
  затем закрывает созданный host без tool dispatch. Повторный SIGINT во время
  delayed close не обрывает cleanup. Process fixture подтвердил guard во время
  закрытия, затем exit=130, guard=false, alive=[], tool_called=false.
  Evidence `/tmp/loginom-cli-tui-d7mkwz75/result.json`.
- [x] Новый subprocess test передаёт ранний настоящий SIGINT в последующее
  stdin admission и проверяет удаление handler после profile cleanup.
  Bootstrap/profile/stdin: 16 tests/68 assertions PASS. Standalone process
  regressions (включая отмену активного provider): 2/84 PASS. Agent typecheck PASS.
- [x] Provider-management test первоначально достиг лимита 5 секунд; отдельно
  прошёл за 4.88 секунды. Лимит двух холодных subprocess поднят до 30 секунд,
  assertions не изменены; полный повторный suite PASS.
- [ ] Native artifact ещё не пересобран с этим controller. Реальная отмена при
  сбое/таймауте host startup, при активной внешней мутации, TUI cancellation и
  network/owner-loss matrix остаются открытыми. Startup здесь дожидается уже
  начатого launch; немедленное прерывание underlying browser launch не доказано.


Desktop regression после выделения общего Host (этапы 2/5):

- [x] Desktop connection/credentials/recovery/host-port: 33 tests/100 assertions;
  packaging/static verifier/proxy: 10/66; Desktop typecheck PASS. Реальный Node
  HTTP/HTTPS CONNECT/loopback/no-direct-fallback proxy test PASS.
- [x] Desktop build с prod channel и комплектными ресурсами PASS; отдельный
  `linux-unpacked` candidate создан в `/tmp/loginom-desktop-cli-regression-20260917`.
  Статический verifier подтвердил 4365 resource hashes и Linux x64 ELF.
- [x] Live GUI smoke через development Electron и packaged executable PASS:
  onboarding, Loginom connection check/save, private permissions 0600, redacted
  IPC, branding, повторный запуск с восстановленным подключением без мастера.
  Для запусков использованы отдельные временные профили. Установленный Desktop
  не изменялся; предыдущие generated outputs сохранены отдельно.
- [x] Записаны dirty snapshot provenance, ASAR/resource hashes, evidence и
  ограничения в [отчёте](../../testing/loginom-ai-agent/reports/2026-09-17-cli-desktop-regression/report.md)
  и каноническом Linux checkpoint.
- [ ] DEB/AppImage install/upgrade, Desktop CSV oracle, одинаковый source build
  Desktop/TUI/run и полные IND-02/03/14 остаются открытыми. Упакованный candidate
  не является установленным релизом; release manifest не создавался.


Канонические CSV fixtures для общего oracle (этапы 3/4):

- [x] В `packages/desktop/test/loginom/fixtures/standalone-cli` сохранены два
  файла `sales.csv`: amount A=10/20/25 и B=40/60/1, UTF-8/LF. Manifest фиксирует
  SHA256, 3 строки, группы Alpha/Beta и суммы 55/101. Проверка bytes, значений,
  групп и hashes PASS. B SHA256:
  `71566126acfc907717a41ba31ef83d8867ca6080979f62948bd906a811492f4c`.
- [x] `runtime-acceptance.ts` использует эти файлы для direct runtime и CLI;
  проверяет hash до запуска чата и включает inputSha256 в summary. Убрана
  разница amount/Value между интерфейсами в новом oracle.
- [x] Исторические прогоны с B=100/1 не переписываются. Headed TUI
  `/tmp/loginom-linux-oracle-6EjG1G` стартовал со старой версией driver и прошёл
  A/B oracle: 32 receipts, cold totals 55/101, settingsReapplied=false, разные
  source paths. Оба TUI exit=0, forced=false, guard=false. По одному собственному
  mapped Chromium window в каждом профиле; после выхода remaining=[].
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-headed-tui/report.md).
- [x] Новый native headless run `/tmp/loginom-linux-oracle-lO4HVe` прошёл оба
  канонических fixtures: 32 receipts, independent cold totals 55/101,
  settingsReapplied=false, отдельные source paths. Оба exit=0/guard=false;
  inputSha256 в summary совпадает с manifest fixtures. Использован прежний
  native candidate 0.0.0-dev-202609171831 и новый acceptance driver.
- [ ] Полные IND-02/03/04/05/14 остаются открытыми: нет общего source snapshot
  с Desktop CSV oracle, canonical B ещё не выполнен через TUI, live resume и
  полная installed/platform/recovery matrix не подтверждены.


Общий scripted provider и Desktop CSV oracle (этапы 2/3/4):

- [x] `oracle-provider.ts` общий для CLI/Desktop acceptance. Desktop transport
  запускает packaged GUI в отдельном профиле, выполняет GUI setup и отправляет
  исходный CSV file part через настоящий Desktop backend API. Прямой Host
  dispatch и synthetic test admission не используются. Разрешения заданы явно
  тестом; model provider scripted, не проверка качества reasoning.
- [x] Desktop candidate `/tmp/loginom-desktop-cli-regression-20260917/linux-unpacked`
  прошёл канонические A/B: 32 receipts, cold sums 55/101, settingsReapplied=false,
  разные source paths, fixture inputSha256 совпали, оба exit=0. Evidence
  `/tmp/loginom-linux-oracle-XSttMQ/summary.json`.
- [x] Native headless TUI с общим provider прошёл оба канонических fixtures:
  `/tmp/loginom-linux-oracle-rvmxcr/summary.json`, 32 receipts, cold sums 55/101,
  settingsReapplied=false, inputSha256 совпали; оба exit=0, guard=false,
  forced=false, input_submitted=true. Расхождение старого B=100/1 устранено
  и теперь проверено через TUI.
- [x] `compare-oracle-contracts.ts` сравнил четыре фактических model captures
  Desktop/TUI A/B: одинаковые 34 tool schemas/descriptions и стартовая Loginom
  инструкция. Изменённая schema отклоняется. Manifest runtime pins обоих
  кандидатов совпали. Общий provider: 2 HTTP/lifecycle tests, 9 assertions PASS;
  Host typecheck PASS. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-desktop-cli-oracle/report.md).
- [ ] Полные IND-02/03/14 ещё открыты: Desktop и CLI candidates имеют разные
  source snapshots, installed Desktop не обновлялся; нужны единая сборка и
  installed acceptance. Desktop attachment отправлен через backend API, не
  renderer file picker. Dynamic tool-result instructions, live resume,
  recovery/native-platform matrix этим сравнением не сертифицируются.


Распаковка CLI archive под private umask (этап 5):

- [x] Попытка единой сборки 0.1.4-cli.202609171924 обнаружила настоящий отказ
  archive verification: `LOGINOM_MANIFEST_PAYLOAD_MISMATCH` под umask 077.
  Воспроизведено: обычный tar extraction меняет file mode 0644 на 0600;
  manifest требует исходные modes. Failed CLI artifact не опубликован.
- [x] Build archive-check теперь использует `tar --same-permissions`.
  Инструкция распаковки добавлена в генерируемый INSTALL.md и CLI runbook.
  Проверка manifest по modes сохранена. Regression test сначала получает
  mismatch обычным tar, затем PASS с сохранением permissions; manifest suite
  2 tests/11 assertions PASS, Host typecheck PASS.
- [ ] Desktop candidate из snapshot
  `0792605c796d1369b60d0ef78f1a3299466cfa00432b73e0e69e4a4086bcb0a7`
  успешно построен и упакован, но CLI той попытки не прошёл archive-check.
  После исправления нужна новая общая сборка; этот snapshot не объявляется
  единым проверенным Desktop/CLI артефактом.


Общая сборка, установленный CLI и реальная ambiguity (этапы 2/3/4/5):

- [x] Desktop/CLI 0.1.4-cli.202609171930, prod, собраны из одинакового dirty
  snapshot `ae9e8448dd7fed563b922c69d8cbb34e7e1a3f211c36bf3fc16c5531c3155c38`.
  CLI archive-check под umask 077 PASS; archive SHA256
  `521fe092193210ace773b4d29c938a741e958be93a5d7ab1dd3e977e0f96a133`.
  Desktop ASAR SHA256
  `5f7d01999b42c964d8cdeb50c546bd1cceb7f4f912d5940cb0d133ac57a2974b`;
  4365 resource checks PASS.
- [x] Последний SIGINT controller проверен в native binary с fixture runtime:
  открытый stdin и delayed startup/repeated SIGINT дают 130, guard=false,
  alive=[], tool_called=false. Это не отмена живой внешней мутации.
- [x] CLI установлен в свободный пользовательский launcher. Run/TUI запущены
  через него без Desktop/Node/Bun/Chrome в PATH; observed Node/Chromium processes
  принадлежат установленному payload. После завершения его processes=[];
  uninstall удалил launcher/payload/receipt и сохранил hashes 43 durable files
  четырёх profiles, включая recovery. Установленный CLI после теста удалён;
  артефакты и profiles сохранены, пользовательский Desktop не изменялся.
- [x] Packaged Desktop `/tmp/loginom-linux-oracle-7pcbuP` и installed headless
  TUI `/tmp/loginom-linux-oracle-qL1sSz` прошли canonical A/B cold oracle 55/101,
  settingsReapplied=false, matching inputSha256, separate source paths и exit=0.
- [x] IND-02 для этой Linux сборки: шесть model captures совпали по 34 schemas
  и bootstrap instruction; все шесть prepare responses совпали по полным
  instructions/knowledge; manifest runtime pins совпали.
- [x] Installed run `/tmp/loginom-linux-oracle-vtSkV0`: A cold total=55 PASS;
  B delivery остановлен с AMBIGUOUS/ARTIFACT_DELIVERY_INCOMPLETE. `deliver-B:nav2`
  получил NOT_APPLIED/UI_EPOCH_CHANGED до dispatch, upload не отправлен.
  Exit=4, guard=false; новый status сохранил recoverable-error и durable marker.
  Ни replay, ни acknowledgement не выполнялись. Это наблюдённый отказ oracle,
  а не PASS второго CSV.
- [ ] IND-03 остаётся FAIL на общей сборке из-за run B. Требуется разобраться
  с навигационной precondition/stability и завершить честную приёмку; предыдущие
  successful run snapshots не подменяют этот результат. Остальные mode/resume,
  recovery/platform/install gates остаются открытыми согласно
  [полному отчёту](../../testing/loginom-ai-agent/reports/2026-09-17-unified-cli-build/report.md).


Навигация после подтверждённого stale precondition (этапы 3/4):

- [x] Локальный regression воспроизвёл отказ выбора destination folder при
  UI_EPOCH_CHANGED. До исправления positive case и bounded-continuation case
  падали; после изменения delivery suite: 46 tests PASS.
- [x] Только matched action receipt с NOT_APPLIED/preconditions,
  effect_possible=false, cleanup_complete=true и UI_EPOCH_CHANGED разрешает
  заново найти ту же папку. Каждая попытка получает новые observation/ref/action
  ID; document/workflow/tab/parent directory и folder kind проверяются повторно.
  Лимит — три попытки, cancellation прекращает продолжение.
- [x] Negative cases подтверждают отсутствие upload/retry при ambiguity,
  возможном или неизвестном эффекте, неподтверждённом cleanup, чужом ID,
  другой phase/code, потерянном ответе, смене владельца/папки/типа и cancellation.
  Upload/verification и ранее settled delivery не повторяются. Ещё 44 теста
  upload/verification/storage/bridge PASS; исходные recovery semantics сохранены.
- [x] Отдельный runtime bundle `/tmp/loginom-epoch-runtime-20260917` содержит
  точный исправленный модуль (SHA256
  `35aff53d345de3b29eb7f8212f66342a129afdae63dfcb4c24fdcb3f594e7c80`).
- [x] Живой direct-runtime oracle `/tmp/loginom-linux-oracle-Wd5srE` прошёл
  новые canonical A/B: 32 receipts, matching input hashes, отдельные source
  paths, independent cold totals 55/101, settingsReapplied=false, exit=0.
  [Отчёт и ограничения](../../testing/loginom-ai-agent/reports/2026-09-17-cli-folder-navigation/report.md).
- [ ] Native candidates 19:30 ещё не содержат fix; нужна пересборка и native
  acceptance. Общий IND-03 и исходный run B не объявляются исправленными.
  Старый recovery не подтверждался и не удалялся.


Нативная общая сборка с folder fix (этапы 2/3/4/5):

- [x] CLI/Desktop 0.1.4-cli.202609171958, prod, собраны из одного dirty snapshot
  `d3a636f78ca43f38c0ceda330c4af34836622de398a668b33bae501e94a54f3d`.
  Исправленный runtime module включён и сверен по SHA256. CLI archive checksum
  `c2fa343095512d46803f82ec04baa1352e77374c41f442d71d35dd9cb26c56ef`;
  native smoke/full manifest/extraction PASS. Desktop package и 4365 resource
  hashes/ELF checks PASS.
- [x] IND-02/03 для описанного Linux oracle: одинаковые canonical A/B,
  prompt/model configuration, совпадающие реальные schemas/instructions/knowledge
  и runtime pins; все три интерфейса построили/выполнили/сохранили/закрыли пакеты,
  independent cold readback дал 55/101 без повторного применения настроек.
  Provider scripted, проверяется семантика pipeline и фактических результатов,
  не качество model reasoning. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-native-folder-fix/report.md).
- [x] Native headless run `/tmp/loginom-linux-oracle-JyyOe1`: 34 receipts,
  оба exit=0/guard=false. Native headed TUI `/tmp/loginom-linux-oracle-DcYBqy`:
  32 receipts, exit=0/guard=false/forced=false; одно собственное mapped окно
  на profile, remaining=[] после выхода. Packaged Desktop
  `/tmp/loginom-linux-oracle-S977oJ`: 32 receipts, оба exit=0.
- [x] У всех шести cases совпали fixture hashes, source/package paths различны.
  После завершения processes из candidate payloads отсутствуют. Исторический
  run B версии 19:30 остаётся failed evidence, его recovery не менялся.
- [ ] Полная mode/resume, permissions/recovery/native-platform matrix,
  installed Desktop/release gates остаются открытыми. Candidate 19:58 не
  устанавливался в пользовательский launcher; новая версия не заменяет
  историческую install/uninstall проверку 19:30.


Продолжение реальной Linux CLI сессии (этапы 3/5):

- [x] Добавлен повторяемый resume acceptance driver и уникальные invocation tool IDs
  scripted provider; исторический response не принимается за новый вызов.
  Provider tests: 2 PASS/10 assertions; host typecheck и Python syntax PASS.
- [x] Native 19:58: исходная run A сессия продолжена через headed TUI `--session`,
  затем headless `run --continue`. Session ID сохранился; каждый запуск добавил
  одно user message и два новых completed Loginom tools. Открыт тот же saved package.
  Оба exit=0/guard=false; TUI forced=false, одно видимое окно; run visible=[];
  после обоих remaining=[]. Evidence `/tmp/loginom-live-resume-jAOvyh`.
  [Отчёт и границы](../../testing/loginom-ai-agent/reports/2026-09-17-cli-live-resume/report.md).
- [ ] Остальные сочетания resume/mode, recovery/cancellation и native platform gates
  этим тестом не закрыты. Полная реализация плана продолжается.


Защита путей Linux installer (этап 5, source):

- [x] `cli-install.ts` проверяет через lstat каждую компоненту от home до
  `.local/share/loginom-ai-agent-cli` и `.local/bin` перед использованием.
  Существующие symlink redirects отклоняются при install и uninstall;
  symlink вместо `current.json` также отклоняется до удаления payload/launcher.
- [x] Проверены redirects `.local`, `.local/share`, `.local/bin`, самого install
  base и receipt: чужие файлы, launcher и payload сохраняются при отказе.
  Package-local install/manifest tests: 3 PASS, 46 assertions; host typecheck PASS.
- [ ] Конкурентная подмена компонентов другим процессом между проверкой и
  filesystem operation остаётся отдельным открытым вопросом. Это защита от
  существующих redirects, не доказательство race-free installer.
  Native 19:58 не пересобирался и этого изменения не содержит.


Windows credential codec (этап 6, source implementation):

- [x] Добавлен CLI DPAPI adapter через системный Windows PowerShell/.NET
  ProtectedData CurrentUser. Versioned envelope `loginom-cli-secrets-v1/dpapi`,
  entropy label изолирован от Desktop. Секреты передаются только stdin/stdout;
  argv содержит фиксированный код, дочернее окружение только SystemRoot,
  timeout/output limit ограничены, ошибки редактированы до фиксированного кода.
  Plaintext fallback отсутствует; legacy/Desktop и повреждённые envelopes отклоняются.
- [x] Linux проверки: 4 PASS, 1 native-only SKIP, 9 assertions; host typecheck PASS.
  Добавлен Windows-only roundtrip/randomized ciphertext/tamper test.
- [ ] Настоящая Windows DPAPI приёмка, включая другую учётную запись,
  packaged Node host и доступность системного PowerShell, ещё не выполнена.
  Windows resources/packaging и macOS Keychain остаются открытыми.
  Это source implementation, не Windows release PASS и не изменение native 19:58.

Использованный API: [Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/standard/security/how-to-use-data-protection).


Windows environment → private Node host (этапы 2/6):

- [x] Исправлен case-sensitive allowlist для Windows plain environment objects:
  `SystemRoot`, `UserProfile`, `Temp` и proxy/CA имена распознаются без учёта регистра.
  В дочернее окружение попадает одно каноническое имя; дубликаты выбираются
  детерминированно по сортировке ключей. Linux сохраняет прежний case-sensitive contract.
- [x] Тест подтверждает mixed-case OS/proxy keys, отсутствие provider secret,
  пользовательского PATH и Linux DISPLAY. Пересобранный Node host запускается
  отдельным pinned Node 24.19.0 процессом, проходит handshake/status и cleanup.
  Environment/credentials/node-host: 7 PASS, 1 Windows-only SKIP, 30 assertions;
  host typecheck и diff check PASS.
- [ ] Это Linux real-process и platform-parameter tests. Реальный Windows host,
  DPAPI, proxy/CA и packaging acceptance остаются NOT_RUN.


Общий staging: пересечение входов и выходов (этапы 2/5/6, source):

- [x] Исправлена односторонняя проверка путей: destination и destination.staging
  не могут ни содержать source/node/browser input, ни находиться внутри него.
  Папка с именем `..nested` корректно считается дочерней, а не выходом к родителю.
  Проверка выполняется до запуска Node и filesystem mutations.
- [x] Stage-resources tests: 6 PASS, 8 assertions; host typecheck и diff check PASS.
  Покрыты вложенный browser output, runtime source output, совпадение и вложение
  input с временным staging. Полный resource build после изменения не запускался.
- [ ] Проверка лексических путей не доказывает отсутствие symlink aliases или
  конкурентной подмены каталогов. Windows/macOS по-прежнему отклоняются до появления
  настоящих native pins/resources; Linux hashes не подставляются за другую ОС.


Общий staging: существующие symlink aliases (этап 5, source):

- [x] К лексической проверке пересечений добавлена проверка canonical paths.
  Для ещё не созданного output разрешается ближайший существующий ancestor;
  это read-only действие до запуска Node, copy и удаления staging/destination.
- [x] Проверены output alias на browser input, вложенный output через alias
  и `.staging` alias на input. Во всех отказах исходный контрольный файл сохранён.
  Stage-resources: 7 PASS, 14 assertions; host typecheck и diff check PASS.
- [ ] Конкурентная подмена пути после проверки остаётся открытой; полный resource
  build и новый native archive после изменения пока не запускались.


Полная сборка после staging/installer изменений (этап 5):

- [x] Native candidate `0.1.4-cli.202609180020`, prod: build/version smoke,
  staging, host/installer bundling, полный manifest и extracted archive verification PASS.
  Snapshot `e292b6a0338a08923e152a1272dfbd0c0643a75034b2bb6bcc53ebb4ef3e8082`.
  Archive SHA256 `d6ff01d874f47904169a3f0e3447d72c529f8b1e715a412b333e8754668a763a`.
- [x] Штатные install/help/version/uninstall нового артефакта PASS;
  launcher/payload/receipt после uninstall отсутствуют. Ограниченный PATH
  не содержит системные Node/Bun/Chrome/Desktop.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-staging-build/report.md).
- [ ] Live pipeline/resume и Desktop regression на новом candidate не выполнялись;
  старые evidence 19:58 не объявляются проверкой этого payload. Native платформы,
  concurrent path replacement и release gates остаются открытыми.


Native CLI owner crash после prepare (этапы 4/5, частичный IND-10):

- [x] Добавлен повторяемый manual driver `cli-owner-crash.ts`; новый profile,
  native candidate 0.1.4-cli.202609180020, headless, существующий пакет открыт
  и проверен по prepare receipt до SIGKILL владельца.
- [x] CLI exit=137; 24 отслеживаемых процесса, alive=[] после завершения.
  Guard сохранён; повторный status вернул код 3/PROFILE_BUSY. Ручного снятия
  guard или повторного исполнения операции не было. Evidence
  `/tmp/loginom-cli-owner-crash-sr1faG`; typecheck/diff check PASS.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-owner-crash/report.md).
- [ ] Остальной IND-10, особенно crash/network во время внешней мутации,
  остаётся открытым. Этот тест относится к завершённому prepare и ожиданию модели.


Native SIGINT после prepare (этап 4, частичный IND-10):

- [x] Driver `cli-owner-crash.ts` поддерживает отдельные сценарии SIGKILL/SIGINT
  с разными ожидаемыми exit/guard/retry результатами.
- [x] На candidate 0.1.4-cli.202609180020 SIGINT при ожидании модели после успешного
  open_package завершил CLI кодом 130; все 24 отслеживаемых процесса завершились,
  guard=false; следующий status code=0, busy=false. Evidence
  `/tmp/loginom-cli-owner-crash-CMtrsH`; host typecheck/diff check PASS.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-owner-crash/report.md).
- [ ] Отмена активной внешней мутации и остальные crash/network случаи остаются
  открытыми; этот PASS относится только к описанной точке ожидания provider.


Сводная проверка host после native/staging изменений:

- [x] Полный `bun test` из packages/loginom-host с pinned Node 24.19.0:
  32 PASS, 1 Windows-only SKIP, 193 assertions, 13 test files; лог
  `/tmp/loginom-host-full-20260917.log`. Проверены текущие connection/recovery,
  Node host, environment, credentials, manifest/install/staging и provider tests.
- [x] Agent run-outcome: 4 PASS, 9 assertions; package-local Agent typecheck PASS.
  Несвязанный успех не стирает ошибку; exact args и Loginom operation_id
  подтверждают поддерживаемую связь исправления.
- [ ] Исправление универсального инструмента через другие аргументы по-прежнему
  не имеет явного подтверждённого repair relation. Нельзя закрыть этот пункт
  простым игнорированием старых ошибок после любого успешного вызова.
  Полный host suite не заменяет native DPAPI или live crash/mutation приёмку.


Обратные browser modes при resume (этап 4, IND-04):

- [x] Driver resume-oracle получил явный `--inverse`: headless TUI --session,
  затем headed run --continue. Native candidate 0.1.4-cli.202609180020 прошёл
  оба случая на прежнем Session ID: по одному новому user message и два fresh tools,
  тот же saved package. Evidence `/tmp/loginom-live-resume-nPuhW5`.
- [x] TUI: exit=0/guard=false/forced=false/visible=[]; run:
  exit=0/guard=false/одно видимое окно. Оба remaining=[]; host typecheck/diff check PASS.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-live-resume/report.md).
- [ ] Все browser modes/resume на едином release artifact, mutation recovery
  и native platform acceptance ещё не закрыты. Здесь scripted provider и read-only
  работа с существующим пакетом; старый opposite-mode PASS относится к 19:58.


Resume browser-mode matrix на одном Linux candidate (этап 4, IND-04):

- [x] Candidate 0.1.4-cli.202609180020 дополнительно прошёл headed TUI --session
  и headless run --continue: `/tmp/loginom-live-resume-CUx0yK`, оба exit=0/guard=false,
  прежний Session ID, по два новых completed tools. Видимость соответствует
  режиму; remaining=[] после обоих запусков.
- [x] Вместе с inverse-прогоном `/tmp/loginom-live-resume-nPuhW5` оба интерфейса
  проверены headed/headless при resume на одном binary. IND-04 PASS для этого
  Linux функционального сценария. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-live-resume/report.md).
- [ ] Это не закрывает Windows/macOS и оставшиеся mutation/recovery/release gates.


Подготовка macOS Keychain codec (этап 6):

- [x] Реализован versioned keychain envelope: AES-256-GCM, новый 96-bit nonce
  на encode, 128-bit authentication tag; canonical profile identity входит в AAD.
  Только apiKey/password шифруются; ключ передаётся codec из будущего native adapter
  и не сохраняется рядом с ciphertext. Payload/key sizes и base64 проверяются.
- [x] Реальный crypto test без mock: UTF-8 roundtrip, новые ciphertext, неправильный
  ключ/профиль, подмена nonce/tag/ciphertext, неверный формат/длина ключа — PASS.
  1 test/12 assertions; host typecheck и diff check PASS.
- [ ] Envelope пока не подключён к darwin CLI: он продолжает fail closed.
  Следующий шаг — bundled native Keychain helper, одна случайная 256-bit key запись
  на canonical profile (отдельный CLI service/account), read без неявного создания,
  создание только для encode; private stdin/stdout, без секретов в argv/files.
  Это избегает новой Keychain записи на каждую connection revision.
  Native helper build/signing, macOS roundtrip/locked Keychain и packaging ещё открыты.

Native API reference: [Apple generic password items](https://developer.apple.com/documentation/security/ksecclassgenericpassword).


macOS native Keychain adapter (этап 6, source):

- [x] Добавлен Objective-C helper `native/keychain.m` с Security/Foundation:
  private stdin operation/profile hash, отдельный CLI generic-password service,
  32-byte random key на account профиля. Read не создаёт отсутствующую запись;
  create допускает повторное чтение при duplicate item. Скрытый UI запрещён,
  ошибки возвращаются без диагностических секретов; ключ выдаётся только stdout.
- [x] `cli-keychain.ts` запускает только абсолютный bundled helper, с пустым env,
  ограничением времени/вывода и строгой проверкой 32-byte base64 key. Canonical
  profile path хешируется для Keychain account/AAD. Node host передаёт root/resources;
  darwin codec вызывает envelope и очищает полученный key Buffer после операции.
- [x] Добавлен native-only `build-keychain.ts`: macOS arm64, deployment target 14,
  без runtime downloads/компиляции. Другие ОС и повторная публикация output отклоняются.
  Linux credentials/envelope/platform/node-host: 7 PASS, 1 Windows SKIP,
  32 assertions; host typecheck/diff check PASS; Node host заново собран и запущен.
- [ ] Objective-C source не компилировался на этой Linux-машине. Native helper
  build/signing, Keychain roundtrip/locked/access-denied/профиль isolation и обновление
  подписанного helper требуют macOS. Общий darwin resource staging ещё не подключён;
  без bundled helper codec fail closed. Неподписанный candidate не считается release.
  Перемещение профиля меняет account/AAD; перенос credentials этим форматом не обещан.


Повторяемая Keychain приёмка (этап 6, подготовка):

- [x] Добавлен `script/keychain-acceptance.ts`: missing read, crypto roundtrip,
  fresh nonce, reopen/canonical alias, profile isolation, tamper и missing helper.
  Фиксированный тестовый secret не выводится; два собственных Keychain entries
  и test profiles сохраняются для диагностики без изменения default Keychain.
- [x] Host typecheck/diff check PASS. На Linux driver проверенно завершился
  MACOS_ARM64_REQUIRED до создания test profiles. Runbook содержит native команды,
  service/account naming и границы проверки.
- [ ] Реальная macOS execution остаётся NOT_RUN; Linux отказ не считается Keychain
  PASS. Locked/denied Keychain, signing/update ACL и packaged host требуют native ОС.


Границы native credential payload (этап 6):

- [x] DPAPI Unprotect допускает служебное расширение ciphertext относительно
  максимального plaintext (Protect 1 MiB, Unprotect до 2 MiB); публичный codec
  заранее ограничивает encoded payload. DPAPI encode сериализует только apiKey/password,
  а не дополнительные поля переданного ActiveConnection.
- [x] Keychain и DPAPI отклоняют oversized envelopes до вызова OS helper.
  Credentials/envelope/platform tests: 7 PASS, 2 Windows-only SKIP, 26 assertions;
  host typecheck/diff check PASS. Добавлен Windows-only boundary roundtrip с
  plaintext ровно 1 MiB, но на Linux он не выполнялся.
- [ ] Native boundary roundtrip остаётся NOT_RUN. Запрошена информация о доступных
  Windows/macOS машинах; это не блокирует оставшуюся локальную реализацию,
  но нативную приёмку нельзя заменить Linux fixtures.


Обязательный helper в macOS payload (этап 6):

- [x] Artifact manifest требует `resources/loginom/bin/loginom-keychain` для darwin;
  отсутствие helper отклоняется как неполная поставка. Helper входит в полную
  hash/mode inventory, изменение после manifest отклоняется.
- [x] Standalone resolver проверяет наличие helper и в dev bundle override;
  missing helper не откладывается до операции сохранения credentials.
- [x] Manifest tests: 3 PASS, 14 assertions, включая missing/tampered helper;
  Host и Agent package-local typecheck, diff check PASS.
- [ ] Это fixture проверка состава, не компиляция/исполнение Mach-O helper и
  не проверка подписи. Native darwin staging/package/acceptance остаются открытыми.


Native run без auto-approve (этап 4, частичные IND-11/12):

- [x] Новый manual driver запускает настоящий candidate 0.1.4-cli.202609180020
  с loginom_*=ask, закрытым stdin, без skip-permissions. Наблюдаемый отказ:
  loginom_dock_prepare state=error, JSON CLI_PERMISSION_REJECTED, exit=1,
  guard=false. Evidence `/tmp/loginom-cli-permission-VuNX3q`.
- [x] Ранний выход после permission denial корректно учитывается драйвером;
  проверяются events и exit, а не наличие следующего provider запроса.
  Host typecheck/diff check PASS. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Остальная permissions/attachment/recovery матрица этим run не закрыта.


TUI permission rejection через PTY (этап 4, IND-11):

- [x] Native candidate 0.1.4-cli.202609180020, отдельный profile: TUI показывает
  Permission required; driver нажимает Escape и подтверждает сохранённый error
  tool part loginom_dock_prepare. Скрытого auto-approve нет.
- [x] Автоматический exit через Ctrl+D: code=0/guard=false/forced=false,
  permission_rejected=true. Evidence `/tmp/loginom-cli-permission-OQjj6A`;
  host typecheck/Python AST/diff check PASS. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Allow once/always, private attachment и оставшаяся permissions matrix
  ещё не закрыты. Нулевой TUI exit не интерпретируется как успешный tool result.


TUI Allow once (этап 4, IND-11):

- [x] Driver подтверждает видимый permission prompt через Enter, без skip-permissions.
  Native 0.1.4-cli.202609180020: dock_prepare completed, receipt prepared=true,
  открыт ожидаемый существующий saved package A. Evidence
  `/tmp/loginom-cli-permission-baLPoW`.
- [x] approved=true/rejected=false/forced=false/exit=0/guard=false;
  host typecheck/Python AST/diff check PASS. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Следующий tool call после Allow once, Allow always и остальные границы
  permissions/attachments остаются открытыми.


Срок действия Allow once (этап 4, IND-11):

- [x] Native TUI 0.1.4-cli.202609180020: первый dock_prepare одобрен Allow once
  и completed; следующий вызов того же инструмента с новым operation_id снова
  показал permission prompt, был отклонён Escape и сохранился как error.
- [x] Evidence `/tmp/loginom-cli-permission-80hod8`: approved=true/rejected=true,
  forced=false/exit=0/guard=false. Host typecheck/Python AST/diff check PASS.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Allow always, межсессионные/после-перезапуска границы и оставшиеся
  attachments/recovery gates ещё открыты.


TUI Allow always в одной сессии (этап 4, IND-11):

- [x] Native 0.1.4-cli.202609180020: видимые Allow always + Confirm;
  первый и второй dock_prepare completed без повторного одобрения. Драйвер
  был готов отклонить повторный запрос. Оба saved receipts подтверждены.
- [x] Evidence `/tmp/loginom-cli-permission-JljE8Q`: alwaysConfirmed=true,
  approved=true/rejected=false/exit=0/guard=false. Host typecheck/Python AST/
  diff check PASS. [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Межсессионная граница и перезапуск после Always отдельно не проверены;
  полный IND-11 этим сценарием не объявляется завершённым.


Always после restart/resume (этап 4, IND-11):

- [x] Новый native run --continue на profile/workspace предыдущего Always-прогона,
  без setup и без skip-permissions: вызов отклонён, CLI_PERMISSION_REJECTED,
  exit=1/guard=false. Фактический Session ID в tool event совпадает с прежним чатом.
- [x] Evidence `/tmp/loginom-cli-permission-Kpsr3d`; host typecheck/diff check PASS.
  [Отчёт](../../testing/loginom-ai-agent/reports/2026-09-17-cli-permissions/report.md).
- [ ] Два чата одного живого процесса и оставшиеся attachment/recovery границы
  по-прежнему требуют отдельной проверки.


Выбор standalone target и Windows native binary (этап 6):

- [x] Agent build поддерживает --target=linux-x64/darwin-arm64/win32-x64
  для standalone. Unknown/duplicate/conflicting --single/--baseline отклоняются;
  проверены три invalid invocations без создания output. Agent typecheck PASS.
- [x] С Linux собран Windows CLI/TUI 0.1.4-cli.202609180110:
  `/tmp/loginom-cli-windows-202609180110-retry/loginom-ai-agent-cli-windows-x64/bin/loginom-ai-agent-cli.exe`.
  file определяет PE32+ console x86-64 Windows; SHA256
  `db5d5a951d9ba8c46cdc1470dccf6bb5083dc4c971cde9159cf7b74e6049562d`.
- [x] Недостающие optional build packages core-win32-x64@0.4.5 и
  fff-bin-win32-x64@0.9.4 получены в локальный cache с точной SHA512 проверкой
  против bun.lock; hooks не выполнялись, package/lock зависимости не редактировались.
  Первая сборка failed на отсутствующих пакетах, повтор в новом output завершился 0.
  Логи `/tmp/loginom-cli-windows-202609180110{,-retry}.log`.
- [ ] Это только cross-compiled binary, не complete Windows distribution:
  native запуск, Node/browser pins, host resources, ZIP/install/uninstall,
  signing и native acceptance остаются открытыми. Linux не исполнял PE.


macOS arm64 standalone binary (этап 6, cross-build):

- [x] Pinned Bun собрал CLI/TUI target darwin-arm64, version 0.1.4-cli.202609180110,
  prod: `/tmp/loginom-cli-darwin-202609180110/loginom-ai-agent-cli-darwin-arm64/bin/loginom-ai-agent-cli`.
  file подтвердил Mach-O 64-bit arm64; package metadata darwin/arm64.
  SHA256 `034504a9ffb211920105599c46dba96d19f0251a2eb9c01c641b2cd0d1dcdea0`.
- [x] core-darwin-arm64@0.4.5 и fff-bin-darwin-arm64@0.9.4 добавлены только
  в локальный build cache с SHA512 из bun.lock, без hooks/изменения dependencies.
  Сборка завершилась 0; log `/tmp/loginom-cli-darwin-202609180110.log`, diff check PASS.
- [ ] Mach-O не исполнялся на Linux. Это не полный darwin archive: native
  Node/browser pins, Keychain helper compilation/signing, staging/install и
  настоящая macOS acceptance ещё открыты. Cross-build не заменяет native PASS.


Native Node resource inventory (этап 6):

- [x] Получены официальные Node v24.19.0 win-x64.zip и darwin-arm64.tar.gz;
  SHA256 архивов совпали с SHASUMS256.txt. Посчитаны отдельные SHA256 native
  executables, file подтвердил PE x64 и Mach-O arm64; LICENSE/npm сохранены.
  [Пути, hashes и детали extraction](../../testing/loginom-ai-agent/reports/2026-09-18-native-node-resources/report.md).
- [ ] Это verified archive inventory, не native execution/release PASS.
  Release pins не изменены до соответствующей платформенной проверки;
  Chromium, staging, signing и полная native acceptance ещё открыты.


Native Chromium resource inventory (этап 6):

- [x] Из закреплённого Playwright получены download URLs Chromium 1243 / Chrome
  for Testing 153.0.8010.12 для Windows x64 и macOS arm64. Архивы скачаны,
  извлечены с CRC/path validation, посчитаны SHA256 архивов и executables.
  file подтвердил PE x64 и Mach-O arm64; пять macOS symlinks сохранены и проверены.
  [Полная сводка](../../testing/loginom-ai-agent/reports/2026-09-18-native-chromium-resources/report.md).
- [ ] Это resource inventory, не native execution: подписи и независимый
  checksum manifest не проверялись, headless-shell/FFmpeg не получены этим шагом.
  Release pins, полные native bundles и платформенная acceptance ещё открыты.


DPAPI native acceptance driver (этап 6):

- [x] Добавлен script/dpapi-acceptance.ts: synthetic roundtrip, fresh ciphertext,
  tamper rejection, автоматический reopen в новом процессе и отдельный режим
  reject-other-user с проверкой разных SID и работоспособности DPAPI получателя.
  Инструкции передачи неизменённого envelope и сверки SHA256 добавлены в runbook.
- [x] Host typecheck PASS; на Linux driver отклонён с WINDOWS_X64_REQUIRED
  до создания evidence. Это проверка платформенного ограничения, не DPAPI PASS.
- [ ] Native выполнение двумя Windows accounts и проверка ACL ещё требуются.


Windows profile ACL source integration (этапы 1/6):

- [x] До создания writer guard подключён Windows ACL adapter. Пустой root
  получает protected ACL текущего SID с наследованием на файлы/каталоги;
  существующий профиль проверяется без рекурсивной перезаписи ACL. Чужой owner,
  посторонние ACE, отсутствие FullControl и reparse points отклоняются.
  Обход не входит в reparse directories; PowerShell запускается по системному
  абсолютному пути, root передаётся через stdin, ошибки редактируются.
- [x] Linux profile regression: 4 PASS / 10 assertions. Добавлены platform rejection
  test (Linux PASS) и Windows-only private inheritance/Everyone rejection test
  (на Linux SKIP). Это source implementation, не native Windows ACL PASS.
- [ ] Нативные PowerShell/NTFS проверки, два Windows accounts, race acceptance
  и оценка времени проверки большого профиля остаются открытыми. Adapter имеет
  timeout 30 секунд и при недоступной проверке запрещает admission.


POSIX profile admission permissions (этап 1):

- [x] Существующий Linux/macOS profile root отклоняется до записи guard, если
  owner отличается от текущего UID или mode разрешает доступ группе/остальным.
  Основные каталоги config/data/state/cache/tmp/loginom проверяются до возврата
  profile paths backend; чужие права не исправляются автоматически.
- [x] Linux: 6 profile tests PASS, 31 assertions. Проверены root 0755 без новых
  файлов, каждый storage directory 0750 без изменения mode и без оставленного
  guard, повторное открытие после восстановления 0700, alias/concurrency/channel
  и nonce invariants. Agent typecheck и diff check PASS.
- [ ] Нативный macOS запуск не выполнен. Проверка охватывает root и основные
  storage directories; она не является рекурсивным аудитом всех POSIX ACL/files
  и не гарантирует защиту от конкурентной подмены файлов другим процессом UID.


Совместная source-регрессия после codecs/ACL (этапы 1/2/6):

- [x] Полный Host набор с pinned Node: 36 PASS / 2 native-only SKIP,
  213 assertions. Standalone management/entry/profile: 16 PASS / 1 native-only
  SKIP, 165 assertions. Реальные Node transport/setup/recovery и early CLI
  bootstrap остаются совместимыми после последних изменений.
- [x] Уточнена обязательная LOGINOM_AI_AGENT_TEST_NODE в инструкциях Host;
  первоначальный запуск без неё и корректный полный повтор отражены в
  [отчёте](../../testing/loginom-ai-agent/reports/2026-09-18-cli-source-regression/report.md).
- [ ] Source regression не заменяет новый installed build, реальные Windows/macOS
  и external mutation/crash acceptance. Эти gates остаются открытыми.


Durable recovery reopen без replay (этапы 2/5):

- [x] Host-port integration теперь повторно создаёт host из того же durable
  profile после release/close/uncertain/runtime disconnect. Сверяются исходные
  recovery IDs, recoverable-error и отказ нового lease до acknowledgement.
- [x] Неполное подтверждение отклоняется с RECOVERY_CONFLICT и сохраняет журнал;
  точное подтверждение очищает recovery и разрешает новый lease. Runtime fixture
  записывает каждый реально полученный call; файл не меняется ни при восстановлении,
  ни при acknowledgement — автоматического replay нет.
- [x] Pinned Node + package-local host-port suite: 5 PASS, 94 assertions;
  Host typecheck и diff check PASS. Начальный вызов tests из root отклонён
  root guard; проверки выполнены повторно из packages/loginom-host. Найденная
  typecheck-ошибка optional recoveries в тесте исправлена, проверки повторены.
- [ ] Это повторное создание Host с новыми реальными Node runtime processes,
  scripted operation states. Полный SIGKILL host/CLI во время внешней Loginom
  mutation и проверка её business outcome этим тестом не покрыты.


SIGKILL runtime до ответа (этапы 2/5):

- [x] Добавлен integration case kill: настоящий supervised Node runtime
  фиксирует вызов в JSONL и получает SIGKILL до отправки ответа. Host возвращает
  LOGINOM_CALL_UNCERTAIN, cleanup не сообщает ложный успех, recovery переживает
  повторное создание host. Новый lease запрещён до полного acknowledgement.
- [x] Проверяется точная последовательность принятых runtime calls; она остаётся
  неизменной после восстановления и acknowledgement. Pinned Node, Host suite:
  6 PASS, 121 assertions; typecheck и diff check PASS.
- [ ] Fixture не исполняет внешний Loginom mutation. Потеря всего CLI/host во
  время внешней операции и её последующий business read-back остаются открытыми.


Живой runtime после разрыва IPC (этап 2):

- [x] Исправлен supervisor: событие disconnect немедленно отклоняет ожидающие
  запросы, не ожидая process exit или стандартного 120s timeout. Новые запросы
  тоже отклоняются. Ошибка cleanup и удержание неопределённости сохранены.
- [x] Реальный Node fixture разрывает IPC и остаётся живым через interval.
  До исправления два ожидающих запроса дали TIMEOUT; после исправления оба
  получают LOGINOM_RUNTIME_DISCONNECTED. Cleanup принудительно завершает child
  и возвращает LOGINOM_RUNTIME_CLEANUP_FAILED, не ложный успех.
- [x] Process/transport/host-port regression: 11 PASS, 136 assertions; Host
  typecheck и diff check PASS. Native Windows исполнение ещё не проверено.


Ограниченное завершение private Node host (этап 2):

- [x] После close reply/разрыва IPC клиент ждёт exit не более пяти секунд,
  затем завершает зависший host. Ответ closed:true без чистого exit не считается
  успехом. Некорректный ответ, потеря связи или signal дают HOST_CLEANUP_FAILED;
  повторный close сохраняет тот же результат, private transport закрывается.
- [x] Реальные Node fixtures: ack-without-exit, disconnect-without-exit и bad-ack,
  плюс штатный bundled host: 4 PASS, 23 assertions; Host typecheck PASS.
  Проверки выполнены на Linux; исходный 30s close request timeout сохранён.
- [ ] Принудительное завершение host не доказывает закрытие всех его браузеров;
  caller сохраняет guard при ошибке cleanup. Native Windows/macOS acceptance
  и новый установленный artifact остаются отдельными gates.


Linux installed candidate с IPC/profile fixes (этапы 1/2/5):

- [x] Собран 0.1.4-cli.202609180038, prod, из стабильного dirty snapshot.
  Native version, полный manifest и extracted archive verification PASS;
  [artifact/hash/evidence](../../testing/loginom-ai-agent/reports/2026-09-18-cli-cleanup-build/report.md).
- [x] Настоящие install/uninstall PASS. Installed launcher с PATH без глобальных
  Node/Bun/Chrome/Desktop выполнил help/version/status. Root 0755 отклонён без
  записи файлов; штатный profile guard освобождён. После uninstall launcher,
  payload и receipt отсутствуют, hashes нового test profile сохранились.
- [ ] На этом кандидате не повторялись live Loginom/TUI/CSV/crash и Desktop
  acceptance; native Windows/macOS, подписи и release gates остаются открытыми.


Live owner loss на новом candidate 00:38 (этапы 2/5):

- [x] После реального открытия существующего тестового пакета SIGKILL CLI:
  exit137, 24 tracked processes, alive=[], guard сохранён, status retry exit3
  PROFILE_BUSY. Evidence `/tmp/loginom-cli-owner-crash-dquG02`.
- [x] Отдельный profile, SIGINT: exit130, 24 tracked, alive=[], guard освобождён,
  status retry exit0. Evidence `/tmp/loginom-cli-owner-crash-0Yz6bX`.
- [x] Оба driver runs завершились PASS; stdout/stderr/retry проверены на отсутствие
  API key. [Сводка](../../testing/loginom-ai-agent/reports/2026-09-18-cli-cleanup-build/report.md).
- [ ] Сигналы отправлялись после готового prepare receipt, без mutation. Active
  external mutation crash, native Windows/macOS и общие release gates открыты.


Реальный active import + SIGKILL (этапы 2/5):

- [x] Driver расширен режимом active-import: исходный test CSV передаётся как
  attachment, создаётся отдельный unsaved draft, выполняются upload/node_apply.
  SIGKILL разрешён только после running receipt и durable recovery JSON.
- [x] Native 00:38 PASS: crash-import running, exit137, tracked24, alive=[],
  guard сохранён, retry exit3 PROFILE_BUSY. После crash подтверждён recovery
  9664a27e-5dd6-4b97-bf69-38dd0a3d7135 (generation1, mode0600).
  [Evidence и пределы проверки](../../testing/loginom-ai-agent/reports/2026-09-18-cli-active-import-crash/report.md).
- [x] Host typecheck и diff check PASS. Test driver не меняет installed binary;
  существующие пакеты не сохранялись, guard/recovery не удалялись.
- [ ] Точная серверная фаза на момент сигнала и business outcome не доказаны;
  независимый persisted mutation read-back, network loss и native OS gates открыты.


SIGINT активного реального импорта (этапы 2/5):

- [x] Расширен active-import driver: SIGINT с неопределённой операцией требует
  code4, RECOVERY_REQUIRED, сохранённый recovery и recoverable-error после restart
  status; обычный SIGINT без recovery по-прежнему требует130.
- [x] Native 00:38 полный повтор PASS, evidence /tmp/loginom-cli-owner-crash-ytSmta:
  tracked24, alive=[], guard=false, exit4, status retry0/recoverable-error,
  recovery bd83c278-57ca-4c7e-bf8b-3f45ef60a914 сохранён, replay/ack не выполнялись.
- [x] Первоначальное неверное driver expectation130 и корректный повтор отражены
  в [отчёте](../../testing/loginom-ai-agent/reports/2026-09-18-cli-active-import-crash/report.md).
  Host typecheck и diff check PASS. Серверный business outcome не объявлен известным.


Admission после отменённой внешней операции (этапы 2/5):

- [x] Новый native run на профиле active-import SIGINT возвращает4 и единственное
  RECOVERY_REQUIRED error event, освобождает guard и сохраняет recovery hashes.
- [x] Отдельный прогон с HTTP counter вместо test model endpoint подтвердил
  0 model requests. Test provider config восстановлен побайтово; автоматические
  acknowledgement/replay не выполнялись. Evidence blocked-*-summary.json в
  /tmp/loginom-cli-owner-crash-ytSmta; [отчёт](../../testing/loginom-ai-agent/reports/2026-09-18-cli-active-import-crash/report.md).
- [ ] Business outcome неопределённой операции и оставшиеся platform/release
  gates не считаются закрытыми этой admission-проверкой.


Windows shared-host Node path (этап 6):

- [x] Исправлен hardcoded bin/node в createLoginomHost: Windows выбирает
  resources/bin/node.exe, Linux/macOS — resources/bin/node. Это согласовано
  с существующими standalone resolver и CLI manifest requirements.
- [x] Linux host/host-port: 7 PASS, 124 assertions; Host typecheck и diff check
  PASS. Runtime resource verifier берёт node/browser paths из manifest.
- [ ] Исправление ещё не входит в исторический native 00:38 artifact и не
  подтверждает Windows execution. Полные Windows staging/installer/acceptance открыты.


Windows user installer source (этап 6):

- [x] Добавлен cli-install-windows.ts и подключён в общий install entrypoint.
  Versioned payload размещается в LOCALAPPDATA/Programs/loginom-ai-agent-cli,
  собственный cmd launcher — в bin. Manifest проверяется до/после копирования,
  существующие launcher/receipt/version не заменяются. PATH registry не меняется;
  installer возвращает каталог для явного добавления пользователем.
- [x] Uninstall проверяет свои receipt/launcher/manifest и отсутствие процессов
  из payload через системный PowerShell. Profiles/чужие PATH entries не удаляются.
  Это source implementation, не проверенная Windows установка.
- [x] Host typecheck, Linux installer regression и Windows platform rejection:
  2 PASS / 1 Windows-only SKIP, 38 assertions; diff check PASS.
- [ ] Windows fixture install/uninstall, cmd argument propagation, busy-process
  protection, concurrent filesystem changes и полноценный ZIP/native resources
  ещё требуют выполнения/завершения. Из Linux нативная приёмка недоступна;
  пользователю задан вопрос о способе доступа к Windows/macOS машинам.


Генерация installer wrappers Windows/Linux (этапы 5/6):

- [x] Выделен build-cli-installer.ts: bundled install.mjs, install/uninstall.sh
  для Linux и install/uninstall.cmd для Windows, отдельные INSTALL.md.
  Windows wrappers используют resources/loginom/bin/node.exe относительно
  своего каталога, DisableDelayedExpansion и передают exit code. Registry PATH
  не меняется; инструкция требует явного user PATH и uninstall из extracted
  archive вне установленного versioned payload.
- [x] Linux build-cli использует общий helper. Оба installer target скомпилированы
  в /tmp/cli installer Проба-VXY7mg. Linux wrapper из чужого cwd и PATH без Node
  достиг bundled installer и отклонил неполный payload с code1; Host typecheck
  и diff check PASS. Проверены пробелы/кириллица в пути Linux wrapper.
- [ ] Windows cmd execution, полный ZIP/resource staging и нативная установка
  по-прежнему не подтверждены; генерация wrappers не считается Windows PASS.


CLI manifest: macOS directory symlinks (этап 6):

- [x] Inventory поддерживает ссылки на каталоги app frameworks: сохраняет
  target string и его hash, не читает каталог как файл и не повторяет обход.
  Файлы реального target продолжают проверяться через их обычные entries.
  Формат file-symlink hashes сохранён для совместимости существующих artifacts.
- [x] Добавлен реальный filesystem fixture Framework.framework/Versions/A и
  Current->A. Проверены один inventory entry для binary, выявление изменения
  target binary и отклонение directory link наружу. Найден и исправлен точный
  parent escape `..`, ранее не покрывавшийся startsWith('../').
- [x] Manifest/install regression: 5 PASS / 1 Windows-only SKIP, 57 assertions;
  Host typecheck и diff check PASS. Первая версия теста выявила parent escape,
  после исправления выполнен полный повтор выбранных проверок.
- [ ] Нативная macOS упаковка/исполнение и resource staging остаются открытыми;
  эта проверка выполнена на Linux и покрывает CLI artifact manifest.


macOS Unix installer source (этап 6):

- [x] Unix install/uninstall допускает darwin с теми же отдельными versioned
  каталогами и ~/.local/bin launcher. Linux /proc проверка сохранена; macOS
  использует абсолютный /usr/sbin/lsof для открытых файлов/mappings payload.
  Процессы дают INSTALL_BUSY, диагностика/timeout/недоступный lsof — отказ проверки.
- [x] Генератор выпускает macOS install/uninstall.sh и INSTALL.md (распаковка
  с сохранением permissions, явный PATH, uninstall из исходного archive вне
  установленного payload). Installer bundle сгенерирован на Linux в
  /tmp/cli-installer-macos-sBJWzi; это не нативное исполнение.
- [x] Linux installer/manifest: 4 PASS, 54 assertions; Host typecheck и diff
  check PASS. Существующий filesystem/live-payload installer test адаптирован
  для macOS, включая обязательный Keychain helper в fixture manifest.
- [ ] Сам lsof на macOS, runtime install/launch/uninstall, signing/Keychain и
  полный darwin archive остаются непроверенными до доступа к нативной машине.


Native resource staging source (этап 6):

- [x] Общий staging выбирает Linux/Windows/macOS layout: node.exe/npm/LICENSE
  для Windows, macOS browser app path и CLI Keychain helper build; Linux sandbox
  настройка остаётся Linux-only. Staging требует совпадения host OS/arch с target
  и проверяет фактическую версию Node, SHA256 inputs и Chromium revision.
- [x] Native archive inventory hashes вынесены в build-only
  script/native-resource-candidates.ts. Product release pins не изменены;
  Windows/macOS resource manifests маркируются platformAcceptance=pending.
  Эти данные разрешают native candidate build, не утверждают release acceptance.
- [x] Копирование сохраняет symlink text; resource manifest/verifier поддерживают
  внутренние directory links и отвергают выход наружу, изменённую ссылку/файл.
  Старый files-only manifest остаётся читаемым. Node integration test PASS
  на Linux с реально скопированным executable; staging preflight 7 PASS/14
  assertions, Host typecheck и diff check PASS.
- [x] Полный Linux staging /tmp/loginom-native-staging-ACeyRl/resources завершился;
  комплектный Node проверил 4365 manifest entries. Log
  /tmp/loginom-native-staging-validation.log. Последующие проверки revision и
  separator preflight не меняют проверенный Linux layout; typecheck повторён.
- [ ] Windows/macOS ветки staging ещё не исполнены; полный build-cli пока
  Linux-only. Native archives/install/crypto/signing/acceptance остаются открытыми.


Полный build-cli для native targets (этап 6):

- [x] Сборщик подключает native resources/installer для linux-x64, win32-x64,
  darwin-arm64; выбирает Windows ZIP и Unix tar.gz, системный archiver и
  platform extraction flags. Каждый архив распаковывается и проверяется до
  публикации; Linux GNU tar flags и no-overwrite publication сохранены.
- [x] Полный Linux candidate 0.1.4-cli.202609180107 PASS: native version,
  source snapshot, staging, installer, archive manifest и 4365 runtime entries
  комплектным Node. [Пути/hashes/ограничения](../../testing/loginom-ai-agent/reports/2026-09-18-cli-native-build-integration/report.md).
- [x] Host typecheck и diff check PASS.
- [ ] Windows ZIP/macOS tar execution, installation, signing и native acceptance
  ещё не выполнены. Доступ к соответствующим машинам остаётся необходимым.


Сверка незавершённых gates с исходным §13/14 (2026-09-18):

- [x] Актуализирован основной CLI checkpoint и migration checkpoint; начальная
  запись «все IND NOT_RUN» явно помечена исторической. Новые результаты не
  переносятся между artifact versions и не объявляются полным completion.
- [ ] Настоящий model provider в live oracle обязателен по §13: scripted provider
  не заменяет его. Запрошен отдельный настроенный CLI-профиль без копирования
  Desktop auth. Нативные Windows/macOS машины также запрошены, ответа пока нет.
- [ ] Остаются варианты IND-10 host/browser crash/network loss, установленный
  Desktop regression IND-14, native proxy/CA/credentials/archives и signing/notices.
  Перечень сформирован из исходных требований, а не из дополнительных hardening
  идей. Цель остаётся активной и незавершённой.

IND-10: диагностика потери host во время импорта (2026-09-18):

- [x] Зафиксирован FAIL артефакта 01:07: после SIGKILL host CLI не завершался
  самостоятельно; rescue SIGINT через 120 секунд дал code 130. Recovery и
  guard сохранены. Исходный FAIL не заменяется новым результатом.
- [x] Исправлен верхний entrypoint: flush/exit выполняются также после ошибки
  cleanup, с сохранением guard. Регрессионный real-process тест PASS (5
  assertions); typecheck agent и loginom-host PASS. Transport fixture 3/3 PASS.
- [x] В crash driver добавлен явный deadlineExceeded: спасательный timeout
  всегда означает FAIL, независимо от итогового кода.
- [ ] Повторный live host crash новым native executable и полная упаковка:
  см. reports/2026-09-18-cli-host-crash/report.md; исходный IND-10 пока не закрыт.

- [x] Повторный live host crash кандидатом `0.1.4-cli.202609180130` PASS:
  code 1 без rescue timeout, все 24 процесса завершены, recovery/guard
  сохранены, повторный вход code 3/PROFILE_BUSY. Evidence
  `/tmp/loginom-cli-owner-crash-ndFZfU`. Проверялся новый native executable
  с явным development bundle 01:07; это не installed/archive acceptance.
- [x] Полный standalone-status suite: 3 PASS, 89 assertions (45.08 s).
- [ ] Полная упаковка и installed acceptance исправленного entrypoint,
  browser crash/network loss остаются открыты; IND-10 целиком не закрыт.

IND-10 browser crash, подготовка live проверки (2026-09-18):

- [x] Добавлен режим browser в ручной crash driver: выбор ровно одного главного
  Chromium текущего chat profile через /proc/PID/exe; readiness browser и
  дочерние --type процессы исключены. Два диагностических запуска остановились
  до SIGKILL из-за прежнего неверного разбора argv; это не PASS продукта.
- [x] Package-local typecheck loginom-host PASS. Подробности и ограничения:
  reports/2026-09-18-cli-browser-crash/report.md.
- [ ] Live результат browser crash и оставшиеся IND-10 gates пока не закрыты.

- [x] Live browser crash кандидатом 01:30 с development bundle 01:07 PASS:
  SIGKILL главного Chromium активного чата после running receipt и durable
  recovery; code 4/LOGINOM_RECOVERY_REQUIRED без timeout, все 24 процесса
  завершены, guard снят после cleanup. Следующий status: recoverable-error.
  Recovery сохранён, acknowledgement/replay не отправлялись. Evidence
  `/tmp/loginom-cli-owner-crash-HuJh5a`; отчёт выше. Точная серверная фаза и
  бизнес-результат не утверждаются.
- [ ] IND-10 остаётся частичным: live runtime crash/network loss и установленный
  полный артефакт ещё требуют проверки; scripted provider не заменяет real model.

IND-10 runtime crash, подготовка проверки (2026-09-18):

- [x] Ручной драйвер получил режим runtime: PID родителя Chromium активного
  чата проверяется по принадлежности дереву CLI и managed-entry.mjs до SIGKILL.
  Readiness runtime не является целью. Typecheck loginom-host PASS.
- [ ] Live результат записывается в reports/2026-09-18-cli-runtime-crash/report.md;
  installed acceptance, network loss и остальные gates остаются открыты.

- [x] Live runtime crash кандидатом 01:30 с development bundle 01:07 PASS:
  code 1 без rescue timeout, все 24 процесса завершены. Диагностика
  LOGINOM_RECOVERY_REQUIRED + LOGINOM_HOST_CLEANUP_FAILED; guard/recovery
  сохранены, повторный вход PROFILE_BUSY/code 3. Evidence
  `/tmp/loginom-cli-owner-crash-yIA8Rn`. Replay/acknowledgement/ручное снятие
  guard не выполнялись. Подробности и границы доказательства — в отчёте выше.
- [ ] Полный IND-10 всё ещё не закрыт: network loss после dispatch и проверка
  полного установленного артефакта остаются обязательными.

Полная Linux упаковка исправленного CLI (2026-09-18):

- [x] Артефакт 0.1.4-cli.202609180135 собран; native smoke, source stability,
  manifest и проверка распакованного архива PASS. SHA256 архива
  74af01b9c6480c74e83117ad009960fc63aafac776956449becf0b78c7e6a0bb.
- [x] Реальный install.sh установил пользовательский payload/launcher; --help
  и --version с ограниченным PATH без внешних runtime PASS.
- [ ] Installed host-crash acceptance выполняется без development bundle;
  результаты: docs/testing/loginom-ai-agent/reports/2026-09-18-cli-installed-cleanup/report.md.
  Tmpfs артефакты эфемерны; это development candidate, не release/signing PASS.

- [x] Installed host crash 01:35 PASS без bundle override: code 1 без timeout,
  все 24 процесса завершены, recovery/guard сохранены, retry PROFILE_BUSY.
  Evidence `/tmp/loginom-cli-owner-crash-Czz85v`. Реальные Loginom/Chromium;
  model provider остаётся scripted.
- [x] Реальный uninstall PASS: launcher/payload отсутствуют, все 3965 хешей
  файлов профиля совпали до/после удаления. Guard/recovery не удалялись.
- [x] Архив сохранён на диск в /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180135-linux-x64.tar.gz;
  повторная проверка SHA256 совпала. Полный план остаётся открытым.

IND-10 network loss, изолированный стенд (2026-09-18):

- [x] Добавлен TCP relay для HTTP Loginom только временного тестового профиля:
  разрыв established connections и отказ reconnect без изменения системной сети.
- [x] Real-socket тест PASS (4 assertions), upstream остаётся доступным напрямую;
  typecheck host PASS. Live запуск полного артефакта 01:35 начат без bundle override.
- [ ] Результат и границы проверки фиксируются в
  docs/testing/loginom-ai-agent/reports/2026-09-18-cli-network-loss/report.md.

- [x] Диагностировано ограничение network-loss стенда: два запуска остановились
  до dispatch с LOGINOM_LOGIN_UNAVAILABLE. HTTP через relay отдельно отвечает
  200 text/html без redirect; browser login через локальный origin пока не доказан.
  Сигнал разрыва не отправлялся, network-loss PASS не заявляется.
- [ ] Следующий шаг: определить ограничение browser login/origin либо применить
  изолированный разрыв с сохранением исходного origin. Gate остаётся открытым.

- [x] Network стенд: контрольная авторизация по исходному адресу PASS; через
  relay WebSocket закрывается до ввода логина. testable=true и нужные data-tid
  присутствуют, отсутствие селекторов исключено. Факт записан в network-loss
  отчёте; серверная проверка Host/Origin пока только гипотеза.
- [ ] Продолжить диагностику WebSocket/origin; реальный разрыв после dispatch
  ещё не выполнен и не засчитывается в IND-10.

Исправление авторизации без пароля, выявленное network стендом (2026-09-18):

- [x] Найдена гонка: Loginom делает пустое поле пароля readonly после выбора
  passwordless account, а loginPage пытался выполнить fill(""). Предыдущая
  отметка stage=username охватывала оба fill; фактический timeout был на пароле.
- [x] loginPage пропускает fill только при пустом supplied password и уже пустом
  inputValue. Старое непустое значение очищается, непустой пароль заполняется.
  Readonly не снимается, проверка аккаунта сохраняется.
- [x] Pinned Node tests: 4 PASS. Live Chromium с исправленным loginPage source
  авторизовался через исходный relay (16 соединений, без отказов). Переписывание
  Host/Origin не требуется для этого случая.
- [ ] Пересобрать runtime в полном артефакте и продолжить network loss после
  dispatch. Source login PASS не заменяет проверку полного сценария.

- [x] Полный артефакт 0.1.4-cli.202609180210 с passwordless fix собран:
  source stability/manifest/extracted archive/native version PASS. Архив сохранён
  в /tmp; SHA256 469e9dbbae2b844e9bb7ea694ec2aeb00098c41266b4aa4ab3533a877d0fc6e3.
- [x] Network driver теперь требует фактически оборванные активные сокеты;
  real-socket тест 5 assertions PASS, host typecheck PASS.
- [ ] Live network-loss запуск нового полного артефакта выполняется без bundle
  override; итог и ограничения будут записаны в network-loss отчёте.

- [x] Новый live запуск прошёл passwordless setup и подготовку Loginom, но
  остановился до network fault: CSV delivery вернул AMBIGUOUS/effect_possible
  и ARTIFACT_DELIVERY_INCOMPLETE. Evidence /tmp/loginom-cli-owner-crash-Ig2Q7p.
  Неопределённая загрузка не повторялась, acknowledgement не отправлялся.
- [ ] Исследовать проверку байтов доставки через relay; network loss остаётся
  непроверенным, исходный критерий не ослабляется.

- [x] Уточнена причина AMBIGUOUS в журнале: DOWNLOAD_EVENT_MISSING после
  успешного download gesture и обнаружения файла назначения. Проверка байтов
  не ослаблена, неопределённая загрузка не повторялась.
- [x] Добавлен вариант сетевого стенда на собственном IPv4 с отказом входящих
  соединений с других адресов. Проверяется гипотеза о download policy loopback;
  security flags Chromium и системная сеть не меняются.
- [ ] Новый отдельный live профиль проверяет этот вариант; результат ожидается.

- [x] Live network loss полного артефакта 02:10 PASS для ограниченного случая:
  после verified CSV delivery, running import receipt и durable recovery оборваны
  4 сокета; 4 reconnect отклонены. CLI code 4/LOGINOM_RECOVERY_REQUIRED без
  timeout, все 24 процесса завершены, guard снят после cleanup, следующий
  status recoverable-error. Evidence /tmp/loginom-cli-owner-crash-nxto7k.
- [x] Recovery сохранён; acknowledgement/явный replay не отправлялись. Точная
  фаза на сервере и бизнес-результат не утверждаются. Использованы реальные
  Loginom/Chromium, scripted provider, полный artifact без bundle override.
- [x] Финальные socket tests: 2 PASS, 6 assertions; host typecheck PASS.
- [ ] Этот результат не заменяет installed acceptance версии 02:10, настоящий
  model provider и оставшиеся native/release/desktop gates исходного плана.

- [x] Версия 02:10 установлена реальным install.sh. Для места удалён только
  промежуточный resource staging ACeyRl этой задачи; архивы/профили сохранены.
- [ ] Installed network-loss acceptance запущен через ~/.local/bin launcher
  без bundle override, с restricted PATH. Результат будет в network-loss отчёте.

- [x] Installed network loss версии 02:10 PASS: реальный launcher/restricted PATH,
  без bundle override; 4 сокета оборваны, 4 reconnect отклонены, code 4 без timeout,
  все 24 процесса завершены, следующий status recoverable-error. Evidence
  /tmp/loginom-cli-owner-crash-nSrSSV; recovery сохранён.
- [x] Реальный uninstall PASS: launcher/payload отсутствуют, 4113 хешей файлов
  профиля совпали до/после. Общая цель остаётся незавершённой; настоящий model
  provider, native OS, installed Desktop и release gates не заменены этим тестом.

Installed Desktop regression, подготовка кандидата (2026-09-18):

- [x] Desktop packaging/static-verifier tests: 5 PASS, 47 assertions.
  Полный Desktop build с текущим host/runtime и passwordless fix PASS.
- [x] AppImage кандидата 0.1.4-cli.202609180220 создан. Первый DEB build
  остановился на ENOSPC во временном FPM-каталоге; ничего не устанавливалось.
- [ ] DEB повторно упаковывается из уже собранного payload с tmpfs TMPDIR.
  Статическая и установленная приёмка ещё не завершены; это dirty development
  candidate, не signed release. Отчёт:
  docs/testing/loginom-ai-agent/reports/2026-09-18-desktop-host-regression/report.md.

- [x] AppImage распакован; все 4365 runtime entries сверены с manifest исходного
  payload, включая архитектуру ELF. Такая же проверка linux-unpacked PASS.
- [ ] DEB retry ещё выполняется (command session 65381, активный xz); перед
  продолжением опросить существующий процесс, не перезапускать сборку. Новая
  Desktop версия пока не установлена; IND-14 не объявляется завершённым.

- [x] DEB retry завершён, версия 0.1.4~cli.202609180220/amd64. Распакованные
  4365 ресурсов и ASAR совпали с проверенным payload; SHA256 обоих артефактов
  записаны в Desktop regression report.
- [x] Пакет возврата 0.1.4 сверён с установленным ASAR до установки кандидата.
- [ ] Установка кандидата выполняется; затем изолированная приёмка и возврат
  исходной версии 0.1.4. Пользовательский процесс не завершается.

- [x] Installed Desktop 02:20 выявил FAIL: root-owned ASAR/desktop entry получили
  закрытые права от umask 077, GUI не запустился. Версия 0.1.4 восстановлена,
  установленный ASAR сверён с исходным пакетом. Пользовательские процессы не закрывались.
- [x] Исправлена Linux упаковка: публичные права payload, umask 022 для FPM metadata,
  sandbox helper 04755 сохранён. Статический verifier теперь проверяет доступность
  payload и desktop entry, а не только хеши. Старый DEB отклоняется проверкой.
- [x] 6 tests/53 assertions и Desktop typecheck PASS; новый unpacked payload прошёл
  permissions check. Проверен запуск config из umask 077.
- [ ] Кандидат 02:25 пакуется (session 60769); требуется installed GUI/runtime
  acceptance и последующий возврат стабильной версии. IND-14 пока не закрыт.

- [x] Новый AppImage 02:25 распакован; public permissions и все 4365 runtime
  entries PASS. DEB проверяется отдельно после завершения сжатия, исходная
  установленная версия по-прежнему 0.1.4.

- [x] DEB 02:25 завершён; public permissions, 4365 runtime entries и ASAR PASS.
  Реальный dpkg install прошёл; installed ASAR совпадает, desktop entry доступен
  обычному пользователю. Installed GUI smoke в отдельном профиле PASS.
- [x] Установленные public permissions и все 4365 runtime entries проверены.
- [ ] Полный installed Desktop CSV oracle выполняется (session 8442, evidence
  /tmp/loginom-linux-oracle-PfL1DD). Обёртка в finally возвращает пакет 0.1.4
  и проверяет ASAR; до её завершения возврат и oracle PASS не утверждаются.

- [x] Installed Desktop 02:25: CSV A import/group/save PASS (35 + 20 = 55),
  независимый cold reopen/readback PASS (55, settingsReapplied=false).
- [ ] CSV B и завершение обёртки возврата 0.1.4 ещё ожидаются; session 8442
  продолжает работу, повторный запуск не нужен.

- [x] Installed Desktop 02:25: CSV B import/group/save PASS (100 + 1 = 101),
  независимый cold reopen/readback PASS (101, settingsReapplied=false).
  Полный oracle exit 0: исходные вложения sales.csv из разных чатов не смешаны,
  оба пакета сохранены и независимо открыты. Evidence /tmp/loginom-linux-oracle-PfL1DD.
- [x] Обёртка завершилась: oracleCode=0, restoreCode=0, restoredAsarMatches=true.
  dpkg подтверждает возврат 0.1.4/install ok installed; пользовательские процессы
  не завершались. Linux installed Desktop regression подтверждён для этого
  development candidate; первоначальный FAIL 02:20 сохранён в отчёте.
- [ ] Остались настоящий model provider, native OS и release/signing gates;
  scripted provider и unsigned Linux developer packages их не заменяют.

Native proxy adapters, source checkpoint (2026-09-18):

- [x] Добавлены read-only Windows CLI collector через WinHTTP CurrentUser API
  и macOS CLI collector через системный scutil. CLI применяет политику до
  provider/host imports; Desktop сохраняет существующий loader.
- [x] Manual HTTP/HTTPS, IPv6, domain/loopback bypass и precedence разбираются;
  automatic/PAC/WPAD/SOCKS/auth/scoped/CIDR/<local> явно отклоняются. Это ограниченный
  subset, а не заявленная поддержка всех системных настроек.
- [x] Известная ошибка policy до host startup возвращает exit 2 и освобождает guard;
  повторный запуск реального CLI не получает ложный PROFILE_BUSY.
- [x] Native parser tests 5/34, CLI proxy 1/8, standalone integration 3/89,
  Linux/Desktop proxy 5/19 — PASS; host/agent/Desktop typecheck PASS.
- [ ] Native collectors и routing на реальных Windows/macOS не исполнены,
  требуется отдельная приёмка и новый artifact build. Подробности/primary sources:
  docs/testing/loginom-ai-agent/reports/2026-09-18-native-proxy-source/report.md.

- [x] Новый полный CLI 02:40 собран: native smoke/source stability/manifest/
  extracted archive PASS. Архив сохранён в /tmp; SHA256
  8bb96171d31ffbe92434595cd03046992afdb9a9bbfe8f81cafada2d3ad7f45d.
- [x] Installed launcher/restricted PATH: help/version без создания профиля,
  настоящий Loginom setup/check, повторный proxy-error exit 2 без stale guard,
  затем обычный status PASS. Bundle override не применялся.
- [x] Uninstall PASS: launcher удалён, все 3676 хешей файлов профиля совпали.
  Evidence /tmp/loginom-cli-0240-1moxqqcv. Это Linux acceptance compiled entry,
  не native Windows/macOS и не запуск настоящего model provider.
- [x] Для места удалена только распакованная копия CLI 01:07 после проверки
  SHA256 сохранённого архива и отсутствия использующих её процессов; архив сохранён.


Фактический граф лицензируемых зависимостей (этап 5, 2026-09-18):

- [x] Native standalone и private Node host сохраняют Bun build-inputs.json;
  отсутствие metadata завершает сборку ошибкой. Старые артефакты не изменялись.
- [x] Реальный Linux compile/version smoke и host build PASS; typecheck обоих
  пакетов PASS. CLI: 3793 emitted inputs / 467 npm package versions; host: 100 / 3.
- [x] Инвентарь package metadata и root notice filenames сохранён в
  docs/testing/loginom-ai-agent/reports/2026-09-18-cli-license-inputs/.
- [ ] У 26 CLI package versions root license file не найден; требуется проверка
  вложенных notices/исходных дистрибутивов. Собрать тексты лицензий, Bun/native
  notices, проверить Chromium и Dock obligations и новый полный архив.
  Граф сборки не означает завершённую license compliance; release gate открыт.

Сбор текстов notices (этап 5, 2026-09-18):

- [x] Build-cli подключает collect-build-notices: emitted CLI/host npm inputs,
  реальные package roots, отдельные каталоги текстов, SHA256 и missing/exclusions.
  Symlink license вне package root отклоняется. Inventory status=incomplete.
- [x] На реальном графе скопированы 442 текста для 467 package versions;
  независимая сверка множества пакетов и всех SHA256 PASS. Host typecheck PASS.
- [ ] Новый полный архив с notices ещё проверяется; 26 missing package texts,
  вложенные notices и Bun/native/resources audit остаются открытыми.

- [x] Полный CLI 03:20 с 442 notice texts собран: native smoke/source stability/
  manifest/extracted archive PASS. Независимая сверка всех notice hashes и
  inventory внутри tar PASS. Архив сохранён в /tmp, SHA256
  758c7522a960f8de3992abb60cfd919d291fc453ba9970ad42b3df2a5888c48a.
- [x] Исправлена обнаруженная полной сборкой база относительных host metafile
  paths (caller cwd); первая попытка завершилась до публикации, повтор PASS.
- [ ] Этот candidate не устанавливался; notices audit остаётся incomplete
  (26 missing + nested/Bun/native exclusions). Подробности в отчёте license-inputs.

Pinned upstream notices (этап 5, 2026-09-18):

- [x] Для четырёх package versions сохранены upstream license texts по gitHead
  опубликованных npm metadata: fff-bun/fff-bin 0.9.4, sigstore/verify 3.1.1,
  remeda 2.26.0. URL/commit/SHA256 сохранены; build проверяет hash без сети.
- [x] Collector на реальном графе: 467 пакетов / 446 файлов / 22 missing.
  Независимая проверка всех SHA256 и четырёх gitHead mappings PASS; typecheck PASS.
- [ ] Новый полный архив после supplements не собирался; 03:20 остаётся прежним.
  Точные источники остальных текстов и native/Bun/nested audit ещё открыты.

Version-tag notices и README attribution (этап 5, 2026-09-18):

- [x] Для 12 версий provider-utils проверены exact version tags → commit и
  package.json name/version; upstream copyright/license notices сохранены с SHA256.
- [x] Collector сохраняет README отдельно от license files, не скрывая missing.
  На реальном графе: 458 notices + 464 README; все 922 хеша PASS, typecheck PASS.
- [x] Drizzle tag с несовпадающей package version не принят; test fixture license
  npm/agent не подставлена вместо собственной. Источники/пробелы записаны в отчёте.
- [ ] Остались 10 missing package entries, полные standard license texts,
  Bun/native/nested audit и новый полный архив. License gate ещё открыт.

Bun notices (этап 5, 2026-09-18):

- [x] Закреплён upstream LICENSE.md Bun 1.3.14 по commit
  0d9b296af33f2b851fcbf4df3e9ec89751734ba4; Bun.revision локального toolchain совпал.
- [x] Build-cli проверяет версию/revision и SHA256, включает LICENSE.md и source.json
  со статусом incomplete. Host typecheck PASS.
- [ ] Native linked-library/polyfill тексты, corresponding source/relinking audit
  не закрыты одним upstream документом. Новый полный архив с README/supplements/Bun
  проверяется отдельно; старый 03:20 не изменялся.

- [x] Полный candidate 03:50 включает 458 npm notices, 464 README и pinned Bun
  LICENSE/source.json. Native smoke, source stability, manifest/extracted archive
  PASS; независимые SHA256 и содержимое архивных inventory/Bun files PASS.
- [x] Архив сохранён в /tmp; SHA256
  b20eeb8f0a509253d9f3046459e86a35047f7ab0d15d246b07738941caca61a5.
- [ ] Candidate 03:50 не устанавливался. License gate остаётся incomplete:
  10 npm entries, native/polyfill тексты и проверенная source/relinking процедура.
  Ссылка upstream на submodules не подтверждена текущим деревом Bun; есть новый
  scripts/build/deps/webkit.ts. Все ограничения отражены в license-inputs report.

Native source notices Bun (этап 5, 2026-09-18):

- [x] По build scripts точного Bun commit закреплены 21 dependency source pin;
  29 license/notice/source files получены для 20 компонентов с URL/commit/SHA256.
  Включены JavaScriptCore/WebCore LGPL тексты и полный picohttpparser.c с MIT notice.
- [x] Build-cli включает native notices и проверяет каждый hash; все 29 локальных
  SHA256 независимо сверены. Host typecheck PASS.
- [ ] Это default source inventory для разных платформ, не exact binary linkage.
  libwebp pin вернул 404; nested/WebKit attribution/другой embedded code/polyfills
  и source/relinking остаются открытыми. Новый полный архив ещё не собирался.

libwebp и Chromium credits (этап 5, 2026-09-18):

- [x] Тот же libwebp commit найден в официальном Chromium gitiles; COPYING,
  AUTHORS/PATENTS добавлены с SHA256. Native collection: 32 files / 21 components.
- [x] Из фактического pinned Linux Chromium получен chrome://credits (757 секций),
  headless с включённой Chromium sandbox; тестовый browser штатно закрыт.
- [x] Проверены binary hash и gzip/plain credits hashes. Linux build-cli экспортирует
  readable credits с проверкой pin/hash; shared notices wording исправлен.
  Host typecheck PASS.
- [ ] Полный архив после этих additions не собран; другие платформы, nested/native
  и corresponding-source/relinking compliance по-прежнему не подтверждены.

Полный notices archive 04:10 (этап 5, 2026-09-18):

- [x] Native smoke/source stability/manifest/extracted archive PASS. Отдельно
  проверены все 32 native hashes и Chromium credits; архивные файлы совпали.
- [x] Архив сохранён в /tmp с независимой SHA256 проверкой:
  e275ca545348d5316e34c1669efbe1da756b56c7150cc50ae3a769aee4cb831e.
- [x] В начало раздела 16 добавлена актуальная сводка этапов и ограничений;
  исторические evidence сохранены, старые PASS не перенесены на этот artifact.
- [ ] Candidate 04:10 не устанавливался; license/release/native/provider gates открыты.

Регрессия сборщика notices (этап 5, 2026-09-18):

- [x] Реальный Bun.build fixture проверяет scoped root против nested package.json,
  точное копирование текста и сохранение missing при README с названием лицензии.
- [x] Symlink LICENSE за пределы package root отклоняется; успешный inventory
  не записан, внешний файл не изменён. Проверены реальные файловые операции.
- [x] Package-local test 1/12 assertions и host typecheck PASS. Windows symlink
  fixture не запускался; общие release/acceptance gates остаются открытыми.

Drizzle source provenance (этап 5, 2026-09-18):

- [x] Опубликованный npm provenance указывает build commit Drizzle; registry
  integrity и фактический tarball SHA512 совпали с subject. LICENSE этого commit
  сохранён с URL/SHA256. Криптографическая подпись provenance отдельно не проверена.
- [x] Source collector: 459 notices + 464 README / 9 missing; все 923 hashes PASS,
  host typecheck PASS. Неподтверждённые commit для AWS не подставлялись.
- [ ] Новый полный архив после добавления Drizzle не собирался; остальные audit
  gaps и native/provider/signing gates остаются открытыми.

Embedded Bun source notices (этап 5, 2026-09-18):

- [x] Из точного Bun commit сохранены целиком assert.ts/events.ts/url.ts с полными
  copyright/MIT notices; хеши проверены. Collection: 32 native files + 3 JS source
  files, добавленная группа включается существующим build loop.
- [ ] Полнота остальных polyfills и nested sources не утверждается. Новый архив
  после Drizzle/JS additions ещё не собран; native/provider среды запрошены.

Installed notices acceptance 04:10 (этап 5, 2026-09-18):

- [x] Штатные install.sh/uninstall.sh в обычном home: launcher в versioned payload,
  restricted PATH help/version PASS, выбранный профиль не создан этим запуском.
- [x] Проверены installed hashes 32 native files и Chromium credits (757 секций).
  Uninstall exit 0 удалил launcher/payload, hash созданного profile fixture сохранён.
  Evidence /tmp/loginom-notices-installed-3cqze87t; Loginom/model run не выполнялся.
- [x] Для места удалены только распакованные 00:20/00:38 после manifest/archive
  SHA256/matching manifest и /proc проверки; архивы, профили и journals сохранены.
- [ ] Drizzle/3 JS source additions ещё требуют нового архива; оставшиеся
  license/native/provider/signing gates не закрыты этой install-проверкой.

Полный и установленный notices candidate 04:30 (этап 5, 2026-09-18):

- [x] Drizzle/3 JS additions вошли в новый полный архив. Native smoke, source
  stability, manifest/extracted archive PASS.
- [x] Штатные install/uninstall PASS. Restricted PATH help/version без профиля;
  проверены installed hashes 459 npm notices, 464 README, 35 native/JS файлов
  и Chromium credits (757 секций). Uninstall сохранил profile fixture.
- [x] Архив сохранён в /tmp, SHA256 независимо проверен:
  02b4597ea8e2e3f3b9f7afa3257e605eb545eb7ee57f9562883171b1d1de76f1.
  Evidence /tmp/loginom-notices-installed-5s7dn5o_; активной установки не осталось.
- [ ] 9 npm collection gaps, прочие license/source/relinking и native/provider/
  signing gates остаются открытыми. Этот candidate не проходил Loginom/model run.

Installed browser/runtime crash 04:30 (этапы 2/5, 2026-09-18):

- [x] Реальный install.sh + installed launcher без bundle override; отдельные
  профили, original CSV, verified upload/running import/durable recovery до SIGKILL.
- [x] Browser crash: code 4, deadline=false, 24 PID завершены, guard снят,
  status recoverable-error; recovery сохранён (OQYQvV).
- [x] Runtime crash: code 1, deadline=false, 24 PID завершены, guard сохранён,
  status code 3/PROFILE_BUSY; recovery сохранён (gj6jFM). Acknowledge/replay не делались.
- [x] Uninstall exit 0, launcher/payload отсутствуют; профили/journals сохранены.
  Runbook исправлен: старые пункты installed IND-10/IND-14 больше не выданы за
  полностью непроведённые. Отчёт: installed-browser-runtime-crash/report.md.
- [ ] Provider scripted; остальные timing/native OS/real provider/release gates
  этим не закрыты. Полная цель остаётся активной.

Author-linked MIT supplement (этап 5, 2026-09-18):

- [x] Для abstract-logging сохранён derived текст из MIT template и явного
  copyright field сервиса, на который ссылается published README. Live URL дал
  403; это не выдано за скачанный LICENSE. Commit/URLs/преобразование/SHA256 записаны.
- [x] Год/авторство не выдуманы. Collector: 460 notices + 464 README / 8 missing;
  все 924 output hashes и host typecheck PASS.
- [ ] Архив 04:30 сохраняет прежний состав; source addition ещё не пересобран.
  Полный license/native/provider/release audit остаётся открытым.

Declared standard license texts (этап 5, 2026-09-18):

- [x] Для SPDX-пакетов сохранены verbatim README + полные заявленные CC0/CC-BY
  тексты по immutable SPDX source; attribution/URLs/hashes/преобразование записаны.
- [x] Для трёх AWS packages tarball SHA512 совпал с registry, package.json/README
  побайтно совпали с installed dependencies. Заявленный Apache-2.0 включён вместе
  с исходными metadata/README; gitHead и copyright holder не выдуманы.
- [x] Collector: 465 notices + 464 README, все 929 hashes и host typecheck PASS.
- [ ] Остались 3 missing text entries (npmcli/agent, poe-auth, opentui-spinner),
  полный compliance audit и новый архив. Native/provider/release gates открыты.

Полный notices candidate 05:00 (этап 5, 2026-09-18):

- [x] Все текущие supplements вошли в архив. Build/native smoke/source stability/
  manifest/extracted archive PASS; штатные install/uninstall PASS.
- [x] Installed hashes 465 notices, 464 README, 35 native/JS файлов и Chromium
  credits проверены; help/version без создания профиля, profile fixture сохранён.
- [x] Архив сохранён в /tmp и SHA256 проверен:
  ad42b2cf58e6b35193e702d07dc843b4b2ae306f39b10694227fb715f1e5cf12.
  Evidence /tmp/loginom-notices-installed-qujutvkt; установка удалена.
- [ ] Остались 3 text gaps и общий compliance/release audit. В стандартных CLI
  profiles нет auth/config; обычные provider-key env vars отсутствуют. Отдельный
  real-provider profile и native OS среды по-прежнему не предоставлены.

Точка продолжения и внешние входы (2026-09-18):

- Последний проверенный development artifact: 0.1.4-cli.202609180500, Linux x64,
  sourceDirty=true. Установка удалена, evidence сохранены. Это не готовый release.
- Для обязательной native приёмки нужны Windows x64 и macOS arm64 hosts с доступом
  к Loginom; cross-build и Linux не заменяют выполнение native installer/crypto/GUI.
- Для real-provider oracle нужен отдельно настроенный CLI-профиль или предоставленный
  пользователем способ его настройки. Default CLI auth/config и распространённые
  provider-key env vars не найдены. Desktop auth не читать и не переносить.
- Для закрытия оставшихся license text gaps нужны подтверждённые тексты/атрибуция
  @npmcli/agent 4.0.2, opencode-poe-auth 0.0.1 и opentui-spinner 0.0.7; label в
  package.json не выдаётся за проверенный полный notice. Source/relinking и
  распространение производных компонентов остаются отдельным незавершённым audit.
- Signing/notarization требуют соответствующих native сред и credentials;
  текущие unsigned dirty candidates остаются dev-only. Исходники не коммитились
  и не публиковались; незавершённые пользовательские изменения сохранены.

Ответ на запрос о native hosts/real-provider profile пока не получен. Новая сборка
с теми же исходниками не закрывает эти пункты. Полная цель не помечена выполненной.

Статус продолжения: BLOCKED (2026-09-18).

Три последовательные проверки подтвердили неизменный внешний барьер: доступна
Linux x64 среда; native Windows/macOS hosts и отдельный real-provider CLI profile
не предоставлены. Default CLI auth/config и распространённые provider-key env vars
отсутствуют. Запрос необходимых данных остаётся без ответа. Цель не завершена;
её полный объём сохранён. Возобновить native/real-provider приёмку после получения
доступа; signing и отмеченные license/source-distribution gaps остаются открытыми.
Последний сохранённый и проверенный development archive — 05:00; evidence и
незакоммиченные исходники сохранены, активной CLI-установки нет.

### Исправления по ревью a7d812e4a — 2026-09-18

- [x] Ошибки Dock распознаются в первом receipt/structuredContent, включая
  FAILED/AMBIGUOUS/NOT_APPLIED, failed и settled с ошибкой worker. Ошибки вложенных
  пользовательских данных не интерпретируются как статус операции. Успешное
  исправление той же операции снимает ошибку; running не подтверждает исправление.
- [x] Ctrl+C для providers/auth/models передаётся в Effect и HTTP-запрос metadata.
  Очистка Instance/AppRuntime выполняется без отменённого signal; завершение
  credential subprocess ожидается перед освобождением профиля.
- [x] Текстовые вложения file/data URL сохраняют полный исходный snapshot для
  admission в Dock; текст для модели ограничен 2000 строками / 50 KiB с ограничением
  длины отдельной строки 2000 символов и явным уведомлением о сокращении.
- [x] Ошибки run `--fork` без `--continue`/`--session` и отсутствующего сообщения
  возвращают CLI_ARGUMENT_INVALID / 2; standalone finally продолжает освобождать
  host и профиль. Legacy CLI сохраняет прежний код.
- Проверки исходников: первый интеграционный проход — 70 passed, 1 existing skip,
  0 failed (standalone, standalone-status, session/prompt); package typecheck прошёл.
  Финальный проход standalone, standalone-status, run-outcome, loginom-result,
  attachment-preview — 20 passed, 0 failed, включая отмену credential subprocess.
  Повторный `bun typecheck` из packages/agent и `git diff --check` — PASS.
  В совокупности проверено 80 разных тестов, 1 existing skip; ошибок нет.

Это исправление исходников. Установленные артефакты не пересобирались, native
Windows/macOS, live OAuth и реальный provider не проверялись; ранее отмеченные
внешние release gates остаются открытыми.

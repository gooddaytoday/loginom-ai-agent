# Loginom AI Agent: CLI и общий локальный backend

Дата: 2026-09-17. Пользователь согласовал все разделы дизайна в текущей задаче.
Статус: спецификация для реализации; новый CLI и общая служба ещё не реализованы.
Исходный снимок анализа: ветка `loginom`, commit `3d48e50cf`.
Независимое ревью документа: **Approved**, 2026-09-17; после уточнения startup/owner
locks, quiescence миграции и отдельного пути recovery. Проверка — чтение документа,
не выполнение будущей реализации.

## 1. Основания и границы

Из задачи «Спланировать Loginom AI Agent»
(`codex://threads/01a0aa97-978e-7800-956d-2351b7bf0a96`) перенесены только требования,
влияющие на CLI: встроенные Dock/runtime/Chromium, единый репозиторий, собственный
бренд и обновления, четыре поля Loginom, отдельная настройка модели, системные
HTTP/HTTPS-прокси, изоляция чатов/вложений, поколения подключения и recovery.
Подробности исходного решения: [desktop-дизайн](2026-09-16-loginom-ai-agent-desktop-design.md).
Текущее состояние Desktop: [Linux checkpoint](../../migration/linux-implementation-checkpoint.md).

Новая поставка поддерживает локальные TUI и `run` на Windows 11+ x64,
Ubuntu 22.04+ / Debian 12+ x64 и macOS 14+ Apple Silicon arm64. Chromium по
умолчанию показывает окно; `--headless` доступен в обоих режимах CLI. Проверяется
работа без окна на локальном компьютере. SSH, CI, удалённая многопользовательская
служба и системный автозапуск не входят в первую версию.

CLI самостоятельно работает без Desktop. Desktop включает CLI той же версии.
Desktop, TUI и `run` одного пользователя и канала выпуска разделяют настройки
Loginom, авторизацию моделей и историю. Разные рабочие каталоги сохраняют
существующую проектную изоляцию; общий профиль не объединяет разные проекты.
Codex/Hermes/Cursor не становятся новыми целями поддержки. Сервер знаний остаётся
отдельным сервисом; его перенос/публикация не входят в эту доработку.

## 2. Выбор архитектуры

Принят один автоматически запускаемый локальный backend v1 на профиль/канал.
Альтернативы — отдельные backend с межпроцессными блокировками и зависимость CLI
от запущенного Desktop — отклонены: первый вариант усложняет владение сессиями,
второй лишает CLI самостоятельности.

Основой CLI служит `packages/agent`, где уже есть TUI, `run`, `attach` и `serve`.
`packages/cli` — экспериментальный v2 с другой идентичностью и API; его не включают
в продукт вместо v1. Из него допустимо использовать проверенные идеи discovery,
но не переносить остановку несовместимого процесса или предполагать наличие lock.

Компоненты и владельцы:

| Компонент | Ответственность и граница |
| --- | --- |
| `packages/product` | Имена, каналы, формат общего профиля, версия service protocol, resource/release pins |
| `packages/loginom-host` | Discovery/клиент локальной службы; connection service/store, credentials abstraction, recovery, runtime supervision, trusted attachments; не импортирует Agent/Core/Server |
| `packages/agent/src/service` (новое) | Исполняемый Node entrypoint: общие backend v1 и Loginom host; HTTP/control API, владение сессиями, клиентские подключения, остановка |
| `packages/agent/src/cli` и `packages/tui` | CLI/TUI-клиенты службы, настройка/статус, ввод пользователя, отображение и разрешения |
| `packages/desktop` / `packages/app` | Electron UI и preload; адаптер подключения к общей службе, форма Loginom, передача управления чатом |
| `packages/loginom-runtime` | Существующие supervised Dock/Playwright/MCP и receipts; отдельные процессы по generation/session/attempt |
| `packages/schema` | Переносимые схемы control API и режима сессии; SDK генерируются штатно |

Agent импортирует host и запускает backend; host не импортирует Agent обратно.
Desktop использует общий client/discovery, а не создаёт собственный экземпляр
connection service. Низкоуровневые connection/recovery модули перемещаются из
desktop без переписывания их бизнес-правил. Runtime не переписывается на другой
язык. Направления Schema → Core/Protocol → Server и запрет Client → Core/Server
сохраняются. Механика Session V2 не меняется.

## 3. Запуск и срок жизни службы

1. Клиент вычисляет профиль и канал через общий path resolver, ещё до импорта
   модулей с побочными эффектами файловой системы/БД.
2. Под эксклюзивной OS-блокировкой `startup` профиля читает private discovery и проверяет
   authenticated health: instance nonce, PID/start identity, service protocol,
   product version, channel, profile ID, resource hash. Один PID не доказывает
   владение; запись в файле не доказывает живую службу.
3. Совместимый процесс используется повторно. При отсутствии живого процесса
   запускается комплектный Node с service entrypoint из того же проверенного
   дистрибутива. Служба захватывает отдельную OS-блокировку `owner`, повторно
   проверяет registration и только затем мигрирует профиль/открывает backend.
   Клиент удерживает `startup` до readiness/ошибки, служба держит `owner` весь
   срок жизни и никогда не ожидает `startup`. Блокировки не передаются между
   процессами. Порядок фиксирован: клиент startup → spawn, ребёнок owner → init.
   Если клиент погиб до readiness, следующий клиент под startup сначала проверяет
   занятость owner и ждёт уже стартующую службу; даже при двух spawned children
   только один получает owner и открывает backend. Проигравший выходит без записей.
   Занятый owner при недоступном health означает STARTING/UNRESPONSIVE, а не право
   удалить lock или убить процесс. OS освобождает owner после смерти владельца;
   stale discovery удаляется только после успешного получения owner.
4. HTTP слушает только loopback на случайном порту, с private bearer/basic token.
   Discovery/token имеют права текущего пользователя (`0700`/`0600`, Windows ACL).
   Управляющие маршруты требуют авторизации; случайные web origins отклоняются.
   Token не передаётся в argv, URL, логи или модель. Private host IPC до runtime
   остаётся отдельной границей; control API не добавляется к инструментам LLM.
5. Клиент регистрируется, поддерживает heartbeat и при выходе освобождает свою
   регистрацию. При отсутствии клиентов и активных drains служба после 5 секунд
   idle grace корректно закрывает runtime/HTTP и удаляет только свою registration.
   Новый клиент во время grace отменяет остановку. HTTP-запрос/подключение само
   по себе не считается вечной client lease.

Закрытие Desktop не выполняет прежний `killSidecar`: оно завершает только задачи,
которыми управляет данный клиент, и отключается. При потере heartbeat более
30 секунд служба отзывает клиентские права, отменяет его активный drain и сохраняет
неопределённые операции. Задачи остальных клиентов продолжаются. Idle grace не
обрезает выполняющуюся отмену. Recovery хранится на диске; неразрешённый маркер
не требует держать процесс живым после завершения всех drains.

Первая версия требует точного совпадения product version и service protocol между
клиентом и живой службой; это намеренно консервативная совместимость. Несовпадение
возвращает `SERVICE_VERSION_MISMATCH` с версиями и инструкцией завершить клиенты
и запустить нужный дистрибутив. Автоматического убийства/подмены живой службы нет.
Updater не заменяет используемые ресурсы до завершения задач: payload устанавливается
в новую versioned directory, переключение выполняется на безопасной границе.

## 4. Общий профиль и миграция

Один resolver используется Desktop, CLI и service. Корень нового профиля:
`<OS appData>/<channel app ID>/shared-v1`; на Linux это
`${XDG_CONFIG_HOME:-~/.config}/com.loginom.aiagent/shared-v1` для prod.
Windows использует `%APPDATA%`, macOS — `~/Library/Application Support`.
Beta/dev используют соответствующие Product app IDs. Profile root содержит
`config/`, `data/`, `state/`, `cache/`, `loginom/`, `control/` и versioned metadata.
Проектные `.loginom-ai-agent/` и `loginom-ai-agent.jsonc` продолжают работать
по существующим правилам и не переопределяют глобальные секреты Loginom.

Backend получает эти точные пути до загрузки `Global`, Auth, Database и Config.
Desktop window/UI preferences остаются в старом Electron userData: они не являются
общими настройками CLI. В общий профиль переносятся user config, model auth,
история/связанные данные, state, Loginom active/pending/recovery и receipts.
Кэши можно пересоздать. Источники берутся из фактических прежних XDG/appData правил,
включая custom XDG, а не только из строк путей текущей машины.

Перед миграцией выполняется quiescence preflight: по PID/start identity,
полному пути executable и открытым source paths проверяется отсутствие прежних
Electron/backend/CLI/runtime писателей текущего профиля. Проверяются известные
install prefixes и процессы того же пользователя; недоступный inventory либо
неустановленное владение источником дают `MIGRATION_SOURCE_BUSY_OR_UNKNOWN`.
Закрытие окна само по себе не считается остановкой. Процессы не убиваются.
SQLite write guard и наблюдение за source inventory удерживаются до commit;
изменение source files/наборов receipts, новый писатель или потерянное наблюдение
прерывают публикацию. До/после snapshot проверяются hashes, file identities и
durable revisions. Это поддерживаемая offline maintenance window, а не блокировка,
которую умеет уважать любой старый binary: пользователь не запускает старые версии
во время переноса. После commit их mutable paths отделены от нового профиля.

Миграция один раз выполняется при таком подтверждённом простое, под owner lock:
inventory → private backup → согласованный SQLite snapshot/связанные файлы →
staging → проверка row counts/IDs/config/generations → атомарная публикация marker.
Копировать один DB-файл при незавершённом WAL нельзя. Исходный профиль сохраняется;
новый shared root не переиспользует mutable файлы старого backend. Сбой до commit
не публикует частичный профиль; повтор использует журнал миграции. Профиль с
конфликтующими legacy источниками не сливается наугад: возвращается список
несекретных путей для явного выбора. Старые версии после миграции не синхронизируются
с новым профилем; инструкция предупреждает не продолжать в них работу.

Private backup не входит в Git, release artifact или экспорт диагностики. Откат
до первого использования нового профиля восстанавливает backup; после новых
записей откат запрещён без отдельного экспорта/согласования, чтобы не потерять чаты.
Удаление любого дистрибутива сохраняет общий профиль и данные другого дистрибутива.

Все продуктовые изменяющие команды проходят через службу: providers/auth,
настройки, MCP/plugin config, session delete/import. Общая конфигурация, изменение
которой вызывает disposal backend instances, применяется только после завершения
затрагиваемых drains. Произвольный `db` maintenance разрешён только с offline lock
при остановленной службе. Наследуемые entrypoints без service adapter отказывают
с явной диагностикой, а не незаметно запускают второго писателя. `--help`/`--version`
не запускают службу и не мигрируют профиль. Ручная правка файлов вне продукта не
считается координируемым клиентом.

## 5. Чаты, управление и режим браузера

Историю могут просматривать несколько клиентов. Изменяющее управление сессией
(prompt, cancel, ответы на permissions/questions, режим браузера) получает один
client ID с временной lease и fencing revision. Backend проверяет её при каждом
запросе; UI-disable не является достаточной проверкой. Контекст directory/session
проверяется backend, а не берётся на доверии из tool arguments.

Второй клиент открывает чат в режиме просмотра. Передача управления явная,
при idle, без unresolved permissions и recovery. У активного владельца её нельзя
отнять скрыто. После disconnect старый token/revision недействителен; новый
владелец допускается только после завершения отмены и разрешения recovery.
Ответы на разрешения от наблюдателя или прежнего владельца отклоняются.
Текущий auto-reject в `run` действует только на его собственный drain.

Для нового чата `headless=false`, явный `--headless` задаёт `true`. Для продолжения
чата отсутствие флага сохраняет режим. Явный `--no-headless` возвращает окно.
Режим хранится в metadata чата, передаётся host как trusted execution option и
участвует в runtime identity наряду с generation/session. Изменение возможно
только при idle и без recovery: старый idle browser закрывается, новый запускается
с новым attempt ID; receipts сохраняются. Активный browser не переключается.
Validation/readiness остаются headless независимо от режима рабочего чата.
`--headless` не меняет способ OAuth-авторизации модели.

Служба получает системные прокси/CA до импорта backend. Сохраняется приоритет
ручных GNOME HTTP/HTTPS настроек над shell и bypass loopback. Для другого desktop
окружения используется доступная платформенная настройка и proxy environment;
невыполненные платформенные проверки не считаются PASS. PAC/SOCKS/auth proxy не
объявляются поддержанными без отдельной реализации/приёмки.
Графические переменные передаются по существующей allowlist. Их обновление
возможно только для новых запусков browser через trusted client context;
не меняет process-wide environment и не затрагивает уже работающий browser.
Нет DISPLAY/Wayland session для headed — понятная ошибка с предложением headless,
без автоматического изменения выбранного режима. Sandbox включён в обоих режимах.

## 6. Настройка, секреты и ошибки

Команды первой версии:

```sh
loginom-ai-agent
loginom-ai-agent --headless
loginom-ai-agent run "Создай сценарий"
loginom-ai-agent run --headless "Создай сценарий"
loginom-ai-agent loginom setup
loginom-ai-agent loginom status
loginom-ai-agent loginom check
loginom-ai-agent loginom recover
loginom-ai-agent loginom cancel-pending
```

`setup` — терминальный мастер четырёх полей с прежними defaults: API-ключ,
`http://logi-test-plan.bg.local/app/`, `user`, пустой пароль без placeholder.
При редактировании сохраняются preserve/replace/empty, revision и проверка
кандидата до save. Корень `/<username>` не спрашивается и не проверяется.
На первом запуске TUI предлагает setup, если подключения нет, с возможностью
отложить; обычный чат остаётся доступным. Настройка также доступна из TUI.
Провайдер модели настраивается отдельно существующим способом, через общий backend.

`run` не открывает мастер. Если Loginom ещё не настроен, продуктовый `run`
возвращает `LOGINOM_NOT_CONFIGURED` и команду setup до допуска prompt. Это
одинаковый preflight для всех `run`, без попытки угадать назначение prompt.
Pending/recovery показываются отдельными состояниями допуска; активный рабочий
конфиг не заменяется неуспешным кандидатом. Отложить настройку и работать с обычным
чатом можно в TUI/Desktop, где состояние подключения видно интерактивно.
Интерактивный ввод secrets — скрытый; `setup --stdin-json` принимает конфигурацию
из stdin для локальных скриптов. API-ключ/пароль не принимаются как CLI argv.

`status` redacted; `check` проверяет сервис знаний и Loginom login, без folder IO.
`recover` показывает operation/receipt и наблюдаемый статус, после явного действия
пользователя вызывает существующий acknowledgeRecovery; не replay изменения.
Это отдельная ограниченная management operation с revision и временной recovery
lease; обычная session control lease ей не нужна. Активный drain или другой
действующий владелец блокируют её; текущий idle-владелец может выполнить recovery
со своей fencing revision. Поэтому потеря владельца не создаёт deadlock, а наблюдатель
не может завершить recovery операции, которой ещё управляет другой клиент.
`cancel-pending` отменяет кандидата с revision, не активный drain.
`--format json` выдаёт структурированный result/error в stdout, progress — в stderr.
Exit codes: 0 success, 1 execution/environment failure, 2 usage/config required,
3 conflict/busy/version mismatch, 4 recovery required, 130 пользовательская отмена.
Отсутствие ключа LLM и ошибка Loginom диагностируются раздельно.

Linux сохраняет Loginom secrets plaintext с `0600`/директориями `0700`.
Windows/macOS получают комплектный native adapter к защите ОС без зависимости
от Electron и без plaintext fallback. Контракт encode/decode остаётся в host;
Windows использует пользовательскую защиту [DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata),
macOS — [Keychain](https://developer.apple.com/documentation/security/keychain-services) с secret refs.
Прежний Electron ciphertext нельзя считать совместимым: обновлённый Desktop
может однократно расшифровать старую запись и передать её по private migration
channel новому store. Если CLI встречает такую legacy запись без доступного
мигратора, он предлагает повторный ввод Loginom secrets; история/model auth не
теряются. Оба пути требуют нативной проверки. Model auth сохраняет прежнюю policy.

## 7. Поставка и сосуществование установок

CLI: `loginom-ai-agent-cli-<version>-linux-x64.tar.gz`,
`loginom-ai-agent-cli-<version>-darwin-arm64.tar.gz`,
`loginom-ai-agent-cli-<version>-win32-x64.zip`. Внутри compiled TUI/CLI,
Node service bundle с closure зависимостей, pinned Node/Dock/Chromium, manifests,
лицензии, модели, `install.sh` либо `install.ps1` и инструкция удаления.
Первый старт не устанавливает npm/browser. Системные библиотеки Linux указываются
явно; архив не обещает отсутствие зависимостей ОС.

Desktop сохраняет DEB/AppImage, EXE, DMG и включает тот же CLI/service payload.
`loginom-ai-agent` запускает TUI, `loginom-ai-agent-desktop`/ярлык — GUI.
Существующая Linux DEB symlink меняется на bundled CLI; desktop entry и URI handler
явно указывают GUI launcher. `/opt/loginom-ai-agent` и app IDs сохраняются.

Standalone устанавливается в отдельный versioned каталог. На Unix пользовательский
launcher в `~/.local/bin` ссылается на него; на Windows отдельный user Programs
каталог добавляется в user PATH. Desktop не перезаписывает пользовательский
launcher; его системная команда остаётся в своём install prefix. `--version`
показывает версию/путь клиента, status — подключённую службу. Удаление standalone
удаляет только принадлежащий ему launcher и payload; PATH/профиль чужих установок
не чистятся. В README описан PATH precedence, включая несовпадающие версии.

Запущенная из AppImage служба не может зависеть от mount, исчезающего после закрытия
GUI. Перед стартом её CLI/service/runtime payload материализуется атомарно в
проверенный user versioned cache, сверяется manifest и удерживается, пока служба
жива. Аналогично portable payload нельзя удалять/заменять во время использования.
GC удаляет только версии без живого service/resource lease.

Portable Linux обязан сохранить Chromium sandbox. Пользовательские namespaces
проверяются реальным стартом; если ОС запрещает их, установка предлагает отдельно
установить комплектный доверенный root-owned sandbox helper системным способом.
Отсутствие разрешённого sandbox — отдельная ошибка, не повод добавлять `--no-sandbox`.
DEB по-прежнему устанавливает helper штатно. Эта зависимость отражается в acceptance.

CLI не обращается к upstream install/update endpoints. Существующий root `install`
перерабатывается: никаких загрузок anomalyco. Публичные feeds остаются выключены.
Для каждой цели pins содержат реальные native hashes; Linux pins нельзя выдавать
за Windows/macOS. Коды подписи/ресурсы проверяются на своих ОС.

## 8. Приёмка

Результат каждого сценария привязан к commit, target, artifact hash, service/resource
manifest и mode. Исторический Desktop PASS не переносится на CLI. Статусы:
PASS, FAIL, BLOCKED, NOT_RUN; отсутствие ключей/машины не считается успехом.

| ID | Наблюдаемое доказательство |
| --- | --- |
| CLI-01 | Чистый профиль, без Desktop/Node/Bun/Chrome в PATH: установлены архив и системные зависимости; TUI и run работают с комплектным runtime; первый startup без скачиваний |
| CLI-02 | Headed и headless отдельно: реальный Loginom CSV 55, save, холодное reopen/readback; видимость окна соответствует режиму |
| CLI-03 | Два одноимённых sales.csv в разных чатах дают 55/101, attachments/receipts/browser profiles не смешиваются |
| CLI-04 | Desktop/TUI/run стартуют одновременно: один backend; разные проекты/чаты работают параллельно; закрытие Desktop сохраняет чужой run |
| CLI-05 | Общие model auth, Loginom настройки и история доступны после переключения клиентов; config update не обрывает чужой drain |
| CLI-06 | Один чат, два клиента: observer не отвечает на permissions; явная idle передача; stale owner и автоответ run отклонены |
| CLI-07 | Headless resume сохраняет режим; explicit idle switch создаёт новый attempt; active/recovery switch отклонён; соседний чат не меняется |
| CLI-08 | Ctrl+C, потеря клиента, crash backend/runtime/browser и сеть после dispatch: отмена только владельца, durable recovery, нет повторных эффектов/оставленных живых потомков |
| CLI-09 | Setup/check/preserve/replace/empty/pending/cancel/recover; defaults и отсутствие folder IO; JSON/exit codes; run не читает мастер из stdin |
| CLI-10 | Миграция реального legacy-профиля/SQLite WAL, сбой до commit, повтор, конфликты, backup/restore: точные IDs/counts, auth и receipts сохранены |
| CLI-11 | Два install prefix/версии, PATH precedence, старый/новый Desktop launcher, idle update; mismatch не убивает задачи; uninstall сохраняет общие данные |
| CLI-12 | Linux file permissions, Windows/macOS native protection/migration, secret scan argv/log/API/model; нет plaintext fallback на native OS |
| CLI-13 | Proxy перед OAuth/LLM/Dock, bypass loopback; headed X11/Wayland и headless; service first-start environment не ломает другой режим |
| CLI-14 | Manifest/архивы/подписи/лицензии/target hashes; AppImage GUI закрыт, оставшийся CLI продолжает работать с доступным payload |
| CLI-15 | Устаревшая discovery, PID reuse, crash во время startup, утрата lock/health, чужой token/origin, channel/profile isolation; нет второго владельца |

Linux: Ubuntu 22.04/24.04/26.04 и Debian 12/13 в Docker для dependencies/runtime,
non-root с sandbox; отдельно реальный локальный Desktop+CLI и X11/Wayland.
Windows/macOS отлаживают агенты на нативных машинах. Им передаются исходный commit,
build prerequisites, pins, схема service/profile, сценарии выше, отчёт и отдельные
защищённые credentials. Их артефакты и проверки остаются NOT_RUN/BLOCKED до выполнения.

## 9. Завершение и продолжение

План: [реализация CLI и общего backend](../plans/2026-09-17-loginom-cli.md).
Готовность документации означает согласованный дизайн, независимое ревью,
проверенные ссылки и исполнимый по задачам план. Это не утверждение о готовности
кода, новых установщиков или native acceptance. Реализация начинается отдельной
задачей по плану; публикация/удаление прежних продуктов сюда не входят.

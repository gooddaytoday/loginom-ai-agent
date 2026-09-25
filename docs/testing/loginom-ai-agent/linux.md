# Linux: сборка и проверка

Цель — Ubuntu 22.04+ и Debian 12+, x86_64. Windows и macOS собираются и отлаживаются на отдельных машинах по соседним инструкциям. Основной Linux-пакет — DEB; AppImage — дополнительный переносимый вариант. Выполненные проверки и их границы приведены в [итоговом отчёте от 16 сентября 2026](reports/2026-09-16-linux/report.md).

## Сборка

Из корня репозитория установить workspace-зависимости закреплённым Bun 1.3.14. Для сборки runtime нужны заранее подготовленные Node 24.19.0 и Chromium revision 1243; точные хеши и версии находятся в `packages/product/loginom-release.json`. Системные Node/Bun пользователя заменять не требуется.

Из `packages/desktop`:

```sh
export LOGINOM_AI_AGENT_CHANNEL=prod
export LOGINOM_AI_AGENT_NODE_SOURCE=/absolute/cache/node-v24.19.0-linux-x64/bin/node
export LOGINOM_AI_AGENT_BROWSER_SOURCE=/absolute/cache/browsers
bun run build
bun run package:linux --x64 --publish never
bun typecheck
bun test src/main/loginom electron-builder.config.test.ts scripts/release/artifact.test.ts
```

Результат: `dist/loginom-ai-agent-linux-amd64.deb` и `dist/loginom-ai-agent-linux-x86_64.AppImage`. Runtime вне ASAR включает собственные Node, Playwright/MCP, Chromium и исходники клиента Dock. Ресурсы проверяются по `resource-manifest.json`. При первом запуске не выполняется установка npm или браузера.

Начиная с 0.1.3, production DEB устанавливает файлы в `/opt/loginom-ai-agent`; название в меню остаётся `Loginom AI Agent`. При обновлении dpkg удаляет старый `/opt/Loginom AI Agent`, профиль пользователя не переносится и не удаляется.

DEB устанавливается через `apt install ./loginom-ai-agent-linux-amd64.deb`: apt разрешает системные зависимости, включая GTK, NSS, GBM и ALSA. AppImage требует эти системные библиотеки и рабочий FUSE либо предварительное извлечение. Для ALSA нужна настоящая библиотека: `libasound2t64` на Ubuntu 24+/Debian 13, `libasound2` на Ubuntu 22/Debian 12; OSS shim её не заменяет. Sandbox Chromium остаётся включённым; запуск root и `--no-sandbox` не являются допустимыми обходами ошибок приёмки.

Исходный архив создавать из того же проверенного commit:

```sh
git archive --format=tar.gz --output=packages/desktop/dist/loginom-ai-agent-0.1.0-source.tar.gz HEAD
```

Команда выполняется из корня репозитория. После фиксации всех build inputs и завершения сборки, из `packages/desktop`:

```sh
bun scripts/release/write-manifest.ts --target linux-x64 --version 0.1.0 --channel prod --dist dist --resources resources/loginom --output dist/release-manifest.json
bun scripts/release/verify-artifact.ts --manifest dist/release-manifest.json --artifact dist/loginom-ai-agent-linux-amd64.deb --report dist/static-deb.json
bun scripts/release/verify-artifact.ts --manifest dist/release-manifest.json --artifact dist/loginom-ai-agent-linux-x86_64.AppImage --report dist/static-appimage.json
```

Статический verifier использует `dpkg-deb` и `unsquashfs`; извлечённый код не исполняется. Manifest для dirty tree намеренно не выпускается: незакоммиченные build inputs сначала должны получить воспроизводимый commit. Неподписанные локальные артефакты обозначаются `unsigned`.

## Docker

```sh
bun test/loginom/docker/run-matrix.ts --artifact dist/loginom-ai-agent-linux-amd64.deb --output dist/linux-matrix
```

Матрица: Ubuntu 22.04, 24.04, 26.04; Debian 12 и 13. Каждый образ устанавливает DEB в чистую ОС. Затем тест работает как UID 1200, с отключённой сетью, запускает встроенный Chromium с sandbox и настоящий Electron-мастер. Проверяются все resource hashes, четыре поля, начальные значения и отсутствие секретов/placeholder пароля. `--only ubuntu22` ограничивает диагностический прогон одной системой. Отчёт и отдельные build/smoke logs сохраняются в указанном каталоге.

Docker запускается с `--init` для корректного Xvfb startup, `seccomp=unconfined` и `apparmor=unconfined`, чтобы ограничения контейнера не запрещали Chromium создавать собственные namespaces. Это параметры тестовой среды, а не отключение sandbox браузера. Во время построения одноразового образа dpkg использует `--force-unsafe-io` для сокращения fsync на диске Docker. Проверки надёжности хранилища приложения выполняются отдельно с обычным fsync.

Контейнеры не доказывают работу физических GPU, Wayland/portal, AppArmor политики конкретного desktop-дистрибутива, системного keyring или автообновления. Эти пункты проверяются нативно.

## Нативные проверки

`test/loginom/gui-smoke.mjs` запускается закреплённым Node под Xvfb либо в отдельной Wayland-сессии. `LOGINOM_AI_AGENT_TEST_EXECUTABLE` указывает установленный бинарник; без переменной проверяется локальная сборка. `LOGINOM_AI_AGENT_TEST_CONFIG` — абсолютный путь к приватному тестовому конфигу Dock с разрешённой passwordless учётной записью. Значение ключа не передаётся в аргументах процесса или выводе. Проверка использует отдельный временный профиль, выполняет check/save, проверяет plaintext/0600 и повторный запуск без мастера.

Для Wayland указать `LOGINOM_AI_AGENT_TEST_WAYLAND=1`, `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, `XDG_SESSION_TYPE=wayland`, убрать `DISPLAY`. Проверка в headless Weston подтверждает использование протокола Wayland, но не заменяет пользовательский сеанс GNOME/KDE. Если Weston извлечён из пакетов без системной установки, его модули можно задать через `WESTON_MODULE_MAP` — пары `имя=путь`, разделённые `;` ([исходный загрузчик Weston](https://cgit.freedesktop.org/wayland/weston/tree/libweston/compositor.c)).

`bun test/loginom/runtime-acceptance.ts` с приватным `LOGINOM_AI_AGENT_TEST_CONFIG` выполняет разрешённый реальный сценарий: два разных исходных `sales.csv`, загрузка с проверкой SHA256, импорт, группировка с итогами 55/101, сохранение, явное закрытие пакета и открытие в новом процессе. При неопределённом исходе тест останавливается и сохраняет отдельные receipts; повтор такой операции автоматически не допускается. Пакеты и загруженные файлы имеют уникальные имена и остаются для проверки. Тест не удаляет пользовательские файлы.

## Настройки и восстановление

Desktop prod хранит профиль в `${XDG_CONFIG_HOME:-~/.config}/com.loginom.aiagent`; beta/dev имеют собственные app IDs. Приватная конфигурация Loginom: `loginom/connection/connection.json`, ожидающая замена — `pending.json`, прежние поколения — `generations/`. В Linux секреты сохраняются открыто с правами 0600 в каталоге 0700, согласно принятому решению.

Перед отправкой tool call main сохраняет маркер. После аварии не подтверждённые маркеры блокируют новые операции Loginom и применение pending-подключения. В настройках пользователь проверяет фактический результат в Loginom и явно завершает восстановление. Это не подтверждает успех старой операции и не повторяет её. Старая история и receipts сохраняются в отдельных каталогах попыток. Остальные модельные чаты продолжают работать.

Удаление DEB удаляет приложение, но сохраняет пользовательские настройки и историю. Существующие OpenCode wrapper/desktop и репозиторий Dock не удаляются автоматически. Автообновление пользовательской сборки отключено до настройки собственного публичного feed. Изолированный тест N→N+1 уже выполнен; проверка отсутствия обновлений не засчитывается за этот тест.

## Аварийное завершение родителя runtime

Из `packages/desktop`, с закреплённым Bun в PATH:

```sh
LOGINOM_AI_AGENT_TEST_CONFIG=/path/to/private/config.json bun test/loginom/parent-crash.ts
```

Тест авторизует изолированный runtime, фиксирует только собственное дерево процессов, завершает родителя supervisor и требует выхода всех живых потомков за 20 секунд. Бизнес-операции не повторяются. Локальная проверка отслеживала 12 процессов и не оставила живых потомков. Независимое открытие сохранённых пакетов с итогами 55 и 101 проверяется отдельным A/B-сценарием.


## Проверка собственного обновления

В репозитории есть [воспроизводимый тест AppImage N→N+1](../../../packages/desktop/test/loginom/updater/README.md). Он создаёт только изолированные тестовые сборки с локальным feed, проверяет повреждённый SHA512 и чужие targets/channels, обновляет приложение и проверяет сохранность настройки и сообщения чата. В пользовательской сборке feed остаётся отключённым; публикация отдельно не выполнялась.


## Прокси через окружение (с 0.1.9)

Автоматический импорт системных настроек GNOME/Windows/macOS отменён. Desktop и CLI
используют явные HTTP_PROXY, HTTPS_PROXY и NO_PROXY, как OpenCode. Chromium сохраняет
собственное системное обнаружение; его сетевое поведение не равно поведению Node.
Для backend и OAuth настройка прокси только в интерфейсе ОС недостаточна.
Передавайте переменные процессу приложения, сохраняя localhost/127.0.0.1/::1 в NO_PROXY.

Причина возврата, ограничения и будущие варианты описаны в
[решении по прокси](../../superpowers/specs/2026-09-22-proxy-policy.md).
Отчёт Linux 0.1.1 ниже является исторической приёмкой прежнего поведения.

Проверка транспорта с локальными HTTP/HTTPS-серверами и временным сертификатом (нужен `openssl`), из `packages/desktop`:

```sh
LOGINOM_AI_AGENT_TEST_NODE=/absolute/path/to/pinned/node /absolute/path/to/pinned/node test/loginom/environment-proxy.ts
```

Проверка ChatGPT через настоящий backend в отдельном пустом профиле:

```sh
LOGINOM_AI_AGENT_TEST_EXECUTABLE='/opt/Loginom AI Agent/loginom-ai-agent' \
xvfb-run -a /absolute/path/to/pinned/node test/loginom/chatgpt-proxy.mjs
```

Последняя проверка обращается к OpenAI: получает device-код (не печатает его) и отправляет заведомо неверный browser authorization code. Ожидаются HTTP 200 для начала device flow и `401 token_expired` для обмена неверного кода. Это доказывает доступ к обоим маршрутам, но **не заменяет вход пользователя**. OAuth-токены пользователя тест не читает и не сохраняет.


## Приёмка исправления масштаба (2026-09-24)

Обязательная матрица и текущие исходные доказательства: [browser-scale](browser-scale.md).
Исторические результаты этого runbook не подтверждают исправленный payload.

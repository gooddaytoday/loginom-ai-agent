# Прямое подключение Chromium Loginom

Решение 2026-09-25: Chromium Loginom использует `--no-proxy-server` независимо от
галочки системного прокси и `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`.
Область: Desktop, CLI TUI/run, проверка подключения и вход, запуск браузера MCP;
режимы с окном и headless, любой адрес приложения. Изменение действует со
следующего запуска браузера, без миграции профиля и без fallback через прокси.

Общие флаги Chromium задают DIRECT до обработки PAC, автоопределения и proxy-server:
[документация](https://www.chromium.org/developers/design-documents/network-settings/),
[реализация](https://github.com/chromium/chromium/blob/main/chrome/browser/prefs/chrome_command_line_pref_store.cc).
Electron `session.resolveProxy`, окружение Node/Bun, модели/OAuth и серверный MCP
сохраняют свою политику. VPN/TUN и маршрутизация ОС не обходятся. Принудительные
корпоративные политики Chromium имеют приоритет над аргументами запуска;
их переопределение не входит в это решение.

## Повторение проверок

Из `packages/loginom-runtime/client` с установленными lockfile-зависимостями:

```sh
LOGINOM_DOCK_TEST_BROWSER=/absolute/path/to/pinned/chromium \
LOGINOM_DOCK_TEST_PUBLIC_APP=1 \
"$LOGINOM_AI_AGENT_TEST_NODE" test/support/run-direct-browser-tests.mjs
```

В CI путь браузера определяется через закреплённый Playwright и
`PLAYWRIGHT_BROWSERS_PATH`. Версия Node проверяется по Product pin; отсутствие
браузера или системных инструментов — ошибка, без пропуска теста. Linux требует
`dbus-run-session`, `xvfb-run`, dconf и GNOME schemas. Root/`--no-sandbox` не используются.

Linux runner создаёт отдельные D-Bus/dconf/Xvfb и временный `XDG_CONFIG_HOME`.
Windows/macOS изменяют нативные настройки только на GitHub-hosted runner:
WinINET per-connection API / SystemConfiguration Dynamic Store. После теста
восстанавливаются исходные значения с read-back. Пользовательская сессия не меняется.

Для обычной локальной проверки без изменения настроек ОС:

```sh
LOGINOM_DOCK_TEST_BROWSER=/absolute/path/to/pinned/chromium \
"$LOGINOM_AI_AGENT_TEST_NODE" --test test/browser-proxy.integration.test.mjs
```

## Покрытие

- Ручной системный HTTP/HTTPS-прокси, системный PAC, явные proxy-переменные и
  недоступный системный прокси; каждый сценарий с окном и headless.
- Контрольный Chromium без DIRECT обращается к прокси; для PAC подтверждается
  загрузка скрипта. Для environment-сценария контроль явно указывает proxy-server:
  Windows/macOS не обязаны читать proxy-переменные. Недоступный прокси ломает контроль.
- Оба продуктовых запуска входят в локальное приложение, выполняют навигацию
  и получают сообщение через настоящий WebSocket. Счётчики прокси/PAC после
  контроля не растут. Сервер привязан к non-loopback адресу: localhost скрывает ошибку
  за встроенным bypass Chromium.
- Командная строка читается через CDP со страницы `chrome://version`: закреплённый
  Playwright не добавляет `--enable-automation`, поэтому `Browser.getBrowserCommandLine`
  недоступен. Проверяются DIRECT, отсутствие конфликтующих proxy-флагов и сохранение sandbox.
- MCP получает тот же авторизованный Page/context; отдельный маркер подтверждает
  сохранение контекста. Настоящие download/upload проверяются существующим browser-downloads тестом.
- При `LOGINOM_DOCK_TEST_PUBLIC_APP=1` managed Chromium открывает HTTPS Loginom
  и проверяет форму входа при активном системном прокси, без ввода пользовательских данных.

## Результаты

Реализация: `connection-check.mjs` и `session.mjs`; backend не изменялся.
TDD: оба запуска отдельно падали на отсутствии DIRECT в командной строке;
после соответствующих изменений локальная headless-регрессия прошла.
Локальная Linux-приёмка: 11/11 тестов, включая все восемь сочетаний proxy/mode,
upload/download и HTTPS Loginom с активным системным прокси. Настройки изолированной
dconf-сессии восстановлены с read-back. Backend: 52 host-теста, 50 Desktop-тестов,
4 standalone CLI proxy-теста и реальные Node HTTP/fetch/HTTPS CONNECT — PASS.
`bun typecheck` в `loginom-host` и `desktop` — PASS; адреса/диагностика/скрипт
download проверены закреплённым Node в трёх дополнительных test-файлах.
Native GitHub-матрица Windows/macOS/Linux: выполнение продолжается.
Это приёмка исходников на закреплённых ресурсах, а не установленного нового релиза.

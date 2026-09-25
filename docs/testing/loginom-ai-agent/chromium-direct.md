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
- Windows при смене WinINET proxy самостоятельно отправляет NCSI GET на
  `http://www.msftconnecttest.com/connecttest.txt` и IPv6-вариант. Только эти два
  точных служебных URL учитываются отдельно, с количеством в журнале;
  любой другой запрос к прокси остаётся ошибкой.
  [Описание NCSI Microsoft](https://techcommunity.microsoft.com/blog/networkingblog/ncsi-change-notification/3866600).
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
4 standalone CLI proxy-теста, 2 теста WebSocket transport/proxy errors и реальные
Node HTTP/fetch/HTTPS CONNECT — PASS.
`bun typecheck` в `loginom-host` и `desktop` — PASS; адреса/диагностика/скрипт
download проверены закреплённым Node в трёх дополнительных test-файлах.
Native GitHub-матрица на коммите `275f1d0cae74a713b5d2765d2214e01217028e67`:

| Платформа | Результат | Свидетельство |
| --- | --- | --- |
| Ubuntu 24.04 x64 | 11/11 PASS | [CI job](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36144018333/job/108100654225) |
| Windows Server 2022 x64 | 11/11 PASS | [CI job](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36144018333/job/108100654078) |
| macOS 14 arm64 | 11/11 PASS | [CI job](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36144018333/job/108100654415) |

На всех трёх ОС включалась проверка публичного HTTPS Loginom. Native-настройки
восстановлены с read-back; проверялись реальные Chromium и Node из Product pin.
[Общий typecheck](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36144018412)
и [Desktop CI](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/36144018333/job/108100654152)
— PASS. Общие unit и app e2e jobs этого workflow на момент фиксации отчёта ещё
выполнялись; их завершение этот отчёт не утверждает.

Это приёмка исходников на закреплённых ресурсах, а не установленного нового релиза.

# Системный прокси v2

Решение от 23 сентября 2026. Заменяет политику «не читать ОС» из
[2026-09-22-proxy-policy.md](2026-09-22-proxy-policy.md): Desktop и CLI снова
подхватывают системный прокси, но любая ошибка этого кода только отключает
подхват и оставляет приложение запущенным.

## Что уходит через прокси

Запросы к моделям и OAuth (в том числе `auth.openai.com`, device flow, refresh,
ChatGPT, Anthropic, Google, OpenRouter, GitHub). Окружение с прокси получает
только backend: sidecar Desktop или процесс CLI после запуска хоста Loginom.
Main-процесс Electron, runtime Loginom и WSL sidecar переменные прокси не
получают. Явный `HTTP(S)_PROXY` / `ALL_PROXY` по-прежнему сильнее системных
настроек. `LOGINOM_AI_AGENT_SYSTEM_PROXY=off` и переключатель в настройках
отключают подхват.

## Перевод

Системные правила переводятся в общий диалект `NO_PROXY`, который одинаково
понимают Bun 1.3.14 и Node 24.15: `имя`, `.имя`, точный IP, `host:port`,
`localhost,127.0.0.1,::1,[::1]`.

| Источник | Результат |
| --- | --- |
| `*` | `*` |
| `vk.com` в Windows/macOS | `vk.com` |
| `*.vk.com`, `.vk.com` | `.vk.com` |
| `*vk.com` и суффикс GNOME/KDE | `vk.com,.vk.com` |
| `<local>`, `ExcludeSimpleHostnames` | имя компьютера, уведомление `approximated` |
| `<-loopback>` | игнорируется, loopback всё равно напрямую, `approximated` |
| IP-маски, CIDR, диапазоны | пропуск, `rules-skipped`, прокси остаётся |

Учётные данные из ОС не копируются. В логе только `host:port`.
Недоступный прокси не обходится напрямую: запрос завершается ошибкой, пользователь
видит `unreachable`.

SOCKS без HTTP на том же порту не применяется (`socks-only`). Если на порту
отвечает HTTP, он используется как HTTP-прокси. PAC в Desktop для списка URL
моделей и OAuth решает Chromium (`session.resolveProxy`). В CLI, если в скрипте
ровно один `PROXY`/`HTTPS`, берётся он, иначе `automatic-unsupported`.
Автоопределение Windows без ручного прокси в CLI — прямой доступ без уведомления.

## Ошибки

`resolveSystemProxy` не отклоняет промис. `read-failed`, `timeout` и `internal`
дают состояние `failed` и запуск без системного прокси. Ранний сбой main-процесса
Desktop до появления окна пишет причину в stderr и завершает процесс с кодом 1,
чтобы не оставлять single-instance lock.

## Проверено в исходниках

- Регрессия `*vk.com` и масок `192.168.*` / `10.200.*` / `10.1.3.*` без исключения.
- Парсеры Windows, scutil, GNOME и KDE, включая враждебный ввод.
- Читатель Linux: код выхода, зависание и `kioslaverc`.
- Контракт `NO_PROXY` на Bun 1.3.14 и Node 24.15 внутри Electron 42.3.3.
- WebSocket OpenAI Responses под Node идёт через `HttpsProxyAgent`.
- CLI: ручной прокси виден следующему `fetch`; сбой `gsettings` пишет
  `SYSTEM_PROXY_NOT_APPLIED` в stderr и не портит JSON stdout.
- Падение main до окна завершается кодом 1.

Приёмка установленных сборок по матрице ниже ещё не выполнялась.

## Матрица приёмки установленных сборок

| Сценарий | Ожидание |
| --- | --- |
| Конфигурация инцидента Windows (`127.0.0.1:9697`, `*vk.com`) | окно открывается, прокси применён |
| Windows по умолчанию | прямой доступ или WPAD из Chromium, без падения |
| Только `socks=` | уведомление, HTTP не подменяется молча |
| Clash Verge Rev system и PAC на macOS | system применяется, PAC совпадает с браузером для URL моделей |
| GNOME manual и auto | manual применяется, auto — эвристика или уведомление |
| KDE | ручной прокси из `kioslaverc` |
| TUN без системного прокси | состояние `direct`, без уведомления |
| Прокси закрытого клиента | `unreachable`, прямого обхода нет |
| `LOGINOM_AI_AGENT_SYSTEM_PROXY=off` | системный прокси не читается |

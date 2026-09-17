# Исправление системного прокси — 17 сентября 2026

Установленный DEB обновлён с **0.1.0 до 0.1.1**. Исходники: `989706951464d4186ac9b06369b4fce9e0d938c8`. Пользовательский сеанс 0.1.0 не завершался принудительно: для применения исправления нужно полностью закрыть приложение и запустить снова.

## Причина и изменение

GNOME был настроен на ручной HTTP/HTTPS-прокси, но Node-backend получал только окружение shell. Прямые запросы к обоим OAuth-маршрутам OpenAI возвращали `403 unsupported_country_region_territory`; через уже настроенный системный прокси device initialization получил 200, а неверный тестовый authorization code — `401 token_expired`.

Теперь ручная системная настройка применяется после shell и имеет приоритет над конфликтующими proxy-переменными. Системные исключения и localhost сохраняются. Изолированный runtime Dock наследует разрешённые proxy/desktop-переменные без ключей провайдеров. При недоступности прокси Node не делает прямой повтор. В OAuth-логи добавлены статус и известный код отказа без сырого ответа, кодов авторизации или токенов.

## Проверки

- 12 desktop-тестов, 46 Codex/OAuth-тестов, 4 host-теста — PASS.
- Typecheck desktop/app, agent и loginom-host — PASS.
- Реальные локальные Node HTTP, fetch, HTTPS CONNECT, обход localhost и отсутствие прямого fallback — PASS. [Сценарий](../../../../../packages/desktop/test/loginom/system-proxy.ts).
- Сначала packaged, затем **установленный `/opt/Loginom AI Agent/loginom-ai-agent`**: device initialization = 200; browser callback с заведомо неверным кодом дошёл до token endpoint = `401 token_expired`. [Отчёт](installed-oauth.json), [сценарий](../../../../../packages/desktop/test/loginom/chatgpt-proxy.mjs). Account login не выполнялся, пользовательские OAuth-токены не читались и не записывались.
- Реальное подключение Loginom из packaged приложения, check/save, Linux plaintext/0600, повторный запуск без мастера — PASS (`/tmp/loginom-proxy-loginom-smoke.log`).
- DEB и AppImage собраны, статически проверены все 4365 runtime-ресурсов: [DEB](static-deb.json), [AppImage](static-appimage.json). `dpkg-query` подтвердил `0.1.1 install ok installed`.
- Системные настройки GNOME и пользовательский профиль приложения не изменялись. Все проверки входа использовали отдельные временные профили.

## Сборки

| Файл | SHA256 |
| --- | --- |
| [loginom-ai-agent-0.1.1-source.tar.gz](../../../../../packages/desktop/dist/proxy-0.1.1/loginom-ai-agent-0.1.1-source.tar.gz) | `ea50891cf090f37dc5c9982701cbd2e8e943b08da49939d2edaf43a0da805dbd` |
| [loginom-ai-agent-linux-amd64.deb](../../../../../packages/desktop/dist/proxy-0.1.1/loginom-ai-agent-linux-amd64.deb) | `6267bdee1535f0cccd7240f4dbd06c8772e7b510a3b2971e4931ebc2e1c40884` |
| [loginom-ai-agent-linux-x86_64.AppImage](../../../../../packages/desktop/dist/proxy-0.1.1/loginom-ai-agent-linux-x86_64.AppImage) | `65146b637281c0b6c8c33f1f206a7d066b13011783b1d7ab260b6bdac31b6553` |

[Release manifest](release-manifest.json). Предыдущие сборки 0.1.0 сохранены; этот отчёт заменяет их только для исправления прокси. Повторная матрица пяти дистрибутивов не запускалась: изменение проверено на текущем Ubuntu/GNOME. Исходная Linux-матрица доступна в отчёте от 16 сентября.

## Границы

Реализован импорт **ручных HTTP/HTTPS-прокси GNOME без proxy-auth**. PAC/SOCKS, KDE и нативные Windows/macOS не добавлены. Изменение системной настройки требует полного перезапуска приложения. Полный вход в собственную подписку ChatGPT должен повторить пользователь после перезапуска. Публичный update feed по-прежнему отключён; сборки неподписаны.

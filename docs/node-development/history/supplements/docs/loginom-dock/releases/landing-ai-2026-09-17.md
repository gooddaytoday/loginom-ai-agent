> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-22b4633afcfa` и изменения: [происхождение](../../../../../provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../unavailable.md). Актуальная работа: [регламент](../../../../../README.md).

# Loginom AI landing — публикация 2026-09-17

По явной команде пользователя опубликован выбранный вариант с localhost:4362 на https://loginom-dock.duckdns.org/.

## Источник и сборка

- Источник: `landing/sites-ai/investigations/living-scenario/dist` (снимок рабочего дерева, не чистый Git-релиз).
- Base HEAD: `9b46c85f68d054a27afad732d74785332098c0ba`.
- SHA256 содержимого: `4c85c51e47905b857ed7ac5dc3ba54f39885e04218347d135fb32d03e1802d21`.
- Release/current: `/opt/loginom-dock/releases/20260917-landing-ai-4c85c51e47`.
- Caddy image: `loginom-dock:landing-ai-4c85c51e47`.
- Сборка выполнена на VPS через `deploy/loginom-dock/Dockerfile.landing-ai` и `landing/sites-ai/investigations/living-scenario/build-public.mjs`. В серверном контексте исходники размещены в `landing-ai/site`, сборщик и `source-manifest.json` — в `landing-ai/`.
- Старый `landing/build.mjs` собирает прежний лендинг: для выбранного дизайна использовать новую сборку. Не заменять её старым шаблоном при следующем релизе.
- В release сохранены `source.tar.gz`, manifest, plan, candidate/visual/deployment checks; локальные receipts: `unavailable:artifact-bf07393f80780166`.

## Изменения для публикации

Сохранены дизайн и темп анимации. Добавлены canonical, robots, sitemap, 404 и совместимый якорь `#install` внутри блока `#start`. Inline-стили SVG перенесены в CSS/атрибуты для действующей строгой CSP. CSP и маршрутизация API не ослаблялись.

## Проверки

36 публичных файлов совпали с manifest по SHA256; CSV возвращаются с text/csv. Главная, CSS/JS и шрифты доступны; политика кеширования сохранена. В браузере проверены анимация лупы и готовый граф, иконки Loginom, автоматический выбор macOS, порядок Windows/macOS/Linux; ошибок и предупреждений браузера нет. Тесты определения OS: 3/3.

API `/health`: 200 healthy; Studio: 200; оба `/studio/connect` перенаправляют на `#install`; API `/mcp`: 401, публичный `/mcp`: 404. Backend container ID остался `d60be4b3a0e788ce587778e131a06b660a2d89f06d89f6414525da06b8f6952d`. Пересоздан только Caddy. Временный preview-контейнер и SSH-туннель закрыты.

Новая установка клиента на Windows/Linux и исполнение синтетических датасетов в Loginom в эту проверку не входили. Публикация не включала commit/push/merge и обновление плагина.

## Откат

Предыдущий current: `/opt/loginom-dock/releases/20260916-migration-rc8`.
Предыдущий образ Caddy: `sha256:c36ab69eb73aab8b841fb8dcc9e0c7b0d96f87e87069c398eb0f5507226554af`.
Резервная копия deploy.env (0600) и `deployment-before.json` находятся в новом release.

Перед откатом проверить текущую конфигурацию на последующие изменения. Если их нет, восстановить `deploy.env.before`, из предыдущего `src` выполнить Compose с project `loginom-dock`, env `/opt/loginom-dock/config/deploy.env`, файлами `docker-compose.yml`, `deploy/loginom-dock/compose.server.yaml`, `/opt/loginom-dock/deploy-stage2/compose.gitlab.yaml`, profile server: `up -d --no-build --no-deps --force-recreate caddy`. Проверить сайт и API /health, затем атомарно вернуть current на предыдущий release. Backend не пересоздавать.

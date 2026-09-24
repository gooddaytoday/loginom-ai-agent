> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-e7da8f4108d6` и изменения: [происхождение](../../../../../provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../unavailable.md). Актуальная работа: [регламент](../../../../../README.md).

# Публикация варианта 4373 — 2026-09-17

По команде пользователя опубликован вариант `landing/sites-ai/ai-variants/architect` на https://loginom-dock.duckdns.org/. AI последовательно создаёт узлы сразу в финальных позициях; скорость часов сборки 3×, темп текста слева и потока данных готового сценария сохранён.

- Current: `/opt/loginom-dock/releases/20260917-landing-architect-d564198369`.
- Image: `loginom-dock:landing-architect-d564198369`.
- SHA256 содержимого: `d5641983690c2a61a18f050c9284f1288499fa611e1e575e10421f838ede76d0`.
- Предыдущий current: `/opt/loginom-dock/releases/20260917-landing-ai-4c85c51e47`.
- Предыдущий Caddy image: `loginom-dock:landing-ai-4c85c51e47`.
- Снимок рабочего дерева, без commit/push/merge. Точный manifest и source.tar.gz сохранены в release; локальные receipts: `unavailable:artifact-ccb5ff515be34f7e`.

Сборка выполнена на VPS через `deploy/loginom-dock/Dockerfile.landing-ai` и manifest-проверяемый build-public.mjs. По сравнению с предыдущей публикацией изменены только index.html, analytics-art.js и добавлен ai-variant.css. Старый `landing/build.mjs` не является сборкой выбранного варианта.

## Проверки

37 публичных файлов проверены по SHA256, включая три CSV; CSP и политика кеширования сохранены. Предпросмотр и публичная страница в браузере дошли до фазы control и шести узлов; ошибок/предупреждений нет. Публичный script URL содержит assemble-speed-4. API /health — 200 healthy; Studio — 200; /studio/connect и /studio/connect/ — 302 на #install; API /mcp — 401, landing /mcp — 404. Backend container ID `d60be4b3a0e788ce587778e131a06b660a2d89f06d89f6414525da06b8f6952d` не изменился. Временный preview и SSH-туннель закрыты.

Установка клиентов и сценарии в Loginom повторно не запускались: это публикация статического лендинга.

## Откат

В новом release сохранены deploy.env.before (0600), previous-current и deployment-before.json. При отсутствии последующих изменений восстановить deploy.env.before, из предыдущего release/src выполнить Compose с project loginom-dock, env `/opt/loginom-dock/config/deploy.env`, файлами docker-compose.yml, deploy/loginom-dock/compose.server.yaml и `/opt/loginom-dock/deploy-stage2/compose.gitlab.yaml`, profile server: `up -d --no-build --no-deps --force-recreate caddy`. Проверить сайт/API и атомарно вернуть current. Backend не пересоздавать.

# Linux Desktop: установка исправления масштаба — 2026-09-25

Локальная сборка production Desktop 0.1.16 из чистого `scale-fix` commit
`9b68f346d6784cd0a7ad65ee211a568810c78e91` на Ubuntu 22.04 x64,
Bun 1.3.14. Это отдельный локальный кандидат, не опубликованный release.

Закреплённые входы: Node 24.19.0 SHA-256
`bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`,
Chromium revision 1243 SHA-256
`8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`.
`bun install --frozen-lockfile`, `bun run build` и electron-builder
`--linux --x64 --publish never` завершились успешно. Runtime staging включил
4381 файла. Артефакты и `release-manifest.json` находятся в
`packages/desktop/dist/0.1.16-scale-fix/`:

| Файл | SHA-256 |
| --- | --- |
| `loginom-ai-agent-linux-amd64.deb` | `da82f00a42a976b88c5a446e3b8978e19dd41b6cd486aae053cfdd3001df9342` |
| `loginom-ai-agent-linux-x86_64.AppImage` | `d3130aa0244b6f4fdfeec5c03ba642fe95e1c4ff9711a28c5c41f12c89414e26` |
| `loginom-ai-agent-0.1.16-source.tar.gz` | `7bff8165924c814a17d3175d3b606f264c8e46becfa52554a2d7f67543a4e7a8` |

Статический verifier для DEB и AppImage: **PASS, 4381 ресурсов каждый**.
`resource-manifest.json` в установленной сборке совпал со staged файлом:
SHA-256 `0240cd9e4eb58265376c0733c4098ae8d6b490c174390c02bf113df213d91558`.
Ключевые `browser-launch.mjs`, `workspace-ui.mjs`, `session.mjs` и
`connection-check.mjs` в `/opt/loginom-ai-agent` побайтово совпали с исходниками.

`bun typecheck`: PASS. Пакетные Desktop-тесты: 47 PASS, 1 предусмотренный SKIP,
0 FAIL. `crash-logging.mjs` на собранном приложении под Xvfb: PASS для маршрутизации
логов, отказа инициализации, неожиданного завершения, native crash, штатного
выхода и лимита журналов. `gui-smoke.mjs` без учётных данных: PASS на собранном
и установленном приложении; проверены форма первого запуска и отсутствие
предзаполненных секретов.

Командой `apt-get install` системный пакет обновлён с 0.1.11 до 0.1.16:
`dpkg-query` вернул `install ok installed`, `/usr/bin/loginom-ai-agent` ведёт к
`/opt/loginom-ai-agent/loginom-ai-agent`, desktop entry содержит
`Name=Loginom AI Agent` и соответствующий `Exec`. Установленный `app.asar`
совпал с распакованной сборкой по SHA-256
`63138e7df423350a0dc4eadaa95be33aa91e021640ccd947c485a8ad0c0398f8`.
Профиль пользователя не очищался; работающее приложение не завершалось.

Здесь не выполнялся авторизованный CSV-сценарий 55/101 на установленном
Desktop, Wayland/дробное масштабирование, смена мониторов, Windows или macOS.
Их приёмка остаётся открытой согласно `browser-scale.md`.
